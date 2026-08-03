-- ============================================================
-- set_tournament_entry_points — fix ambiguous "club_id" column reference
-- Mi Pádel Club
-- ============================================================
-- Same root cause and same fix already applied to the six other
-- tournament RPCs from this same migration (create_tournament:
-- 20261013000001, open_tournament_registration: 20261014000001,
-- close_tournament_registration: 20261015000001,
-- register_tournament_entry: 20261016000001, cancel_tournament:
-- 20261017000001, start_tournament: 20261018000001):
-- set_tournament_entry_points's RETURNS TABLE also declares a "club_id"
-- output column, implicitly exposed by PL/pgSQL as a bare variable name
-- throughout the function body. The SUPERADMIN-fallback lookup's NOT
-- EXISTS subquery referenced public.club_members without an alias:
--
--   NOT EXISTS (
--     SELECT 1 FROM public.club_members
--     WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
--   )
--
-- making bare `club_id` ambiguous against that implicit RETURNS TABLE
-- variable (code 42702) — breaks "Guardar puntos" for OWNER and ADMIN
-- alike, since both go through this same authorization block before the
-- in_progress/points-validation logic and the UPDATE ever run. Confirmed
-- by direct source inspection matching the identical, already-verified
-- pattern (verified live for its 6 sibling functions). The sibling first
-- UNION branch already avoids this correctly by aliasing (`cm.club_id`,
-- `cm.profile_id`, `cm.is_active`) — this migration only applies that
-- same convention to the one subquery that was missing it.
--
-- No other line changes: same in_progress-only status check, same
-- non-negative points validation, same duplicate-entry-id check, same
-- "all entries must be confirmed entries of this tournament" check, same
-- bulk UPDATE via unnest, same OWNER+ADMIN authorization.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_tournament_entry_points(
  p_tournament_id uuid,
  p_entry_ids     uuid[],
  p_points        integer[]
)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_count          int;
  v_bad_count      int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members AS cm2
        WHERE cm2.club_id = v_tournament.club_id AND cm2.profile_id = auth.uid() AND cm2.is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to edit points for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to edit points for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Tournament is not in progress' USING ERRCODE = '22023';
  END IF;

  IF p_entry_ids IS NULL OR p_points IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No entries provided' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_entry_ids, 1) <> array_length(p_points, 1) THEN
    RAISE EXCEPTION 'Entry ids and points must have the same length' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count FROM unnest(p_points) AS pt WHERE pt IS NULL OR pt < 0;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Points must be non-negative integers' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count FROM (SELECT DISTINCT x FROM unnest(p_entry_ids) AS x) AS d;
  IF v_bad_count <> array_length(p_entry_ids, 1) THEN
    RAISE EXCEPTION 'Duplicate entry ids provided' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.tournament_entries AS te
  WHERE te.id = ANY(p_entry_ids) AND te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_count <> array_length(p_entry_ids, 1) THEN
    RAISE EXCEPTION 'All entries must be confirmed entries of this tournament' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET points = u.points
  FROM (SELECT unnest(p_entry_ids) AS entry_id, unnest(p_points) AS points) AS u
  WHERE te.id = u.entry_id;

  RETURN QUERY
  SELECT te.id, te.tournament_id, te.club_id, te.category, te.secondary_category, te.status, te.points,
         te.confirmed_at, te.confirmed_by, te.withdrawn_at, te.withdrawn_by,
         te.rejected_at, te.rejected_by, te.rejection_reason,
         te.created_by, te.created_at, te.updated_at
  FROM public.tournament_entries AS te
  WHERE te.id = ANY(p_entry_ids);
END;
$$;
