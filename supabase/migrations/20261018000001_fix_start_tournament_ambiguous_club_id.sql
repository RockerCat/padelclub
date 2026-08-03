-- ============================================================
-- start_tournament — fix ambiguous "club_id" column reference
-- Mi Pádel Club
-- ============================================================
-- Same root cause and same fix already applied to create_tournament
-- (20261013000001), open_tournament_registration (20261014000001),
-- close_tournament_registration (20261015000001),
-- register_tournament_entry (20261016000001) and cancel_tournament
-- (20261017000001): start_tournament's RETURNS TABLE also declares a
-- "club_id" output column, implicitly exposed by PL/pgSQL as a bare
-- variable name throughout the function body. The SUPERADMIN-fallback
-- lookup's NOT EXISTS subquery referenced public.club_members without an
-- alias:
--
--   NOT EXISTS (
--     SELECT 1 FROM public.club_members
--     WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
--   )
--
-- making bare `club_id` ambiguous against that implicit RETURNS TABLE
-- variable (real error, verified by direct source inspection against the
-- exact same failing pattern already confirmed live 5 times for its
-- sibling functions: code 42702, "column reference \"club_id\" is
-- ambiguous... PL/pgSQL variable or a table column"). Breaks for OWNER
-- and ADMIN alike, since both go through this same authorization block
-- before the status/confirmed-count checks and the UPDATE ever run —
-- matches "el propietario (owner) no puede iniciar un torneo". The
-- sibling first UNION branch already avoids this correctly by aliasing
-- (`cm.club_id`, `cm.profile_id`, `cm.is_active`) — this migration only
-- applies that same convention to the one subquery that was missing it.
--
-- No other line changes: same allowed source status
-- (registration_closed only), same "at least 1 confirmed pair" check,
-- same compare-and-swap UPDATE (status = 'in_progress', started_at,
-- started_by), same concurrency guard, same OWNER+ADMIN authorization.
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id uuid)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member   public.club_members%ROWTYPE;
  v_tournament      public.tournaments%ROWTYPE;
  v_confirmed_count int;
  v_updated_count   int;
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
    RAISE EXCEPTION 'Not authorized to start this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to start this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'registration_closed' THEN
    RAISE EXCEPTION 'Only a tournament with closed registration can start' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_confirmed_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_count < 1 THEN
    RAISE EXCEPTION 'Tournament needs at least one confirmed pair to start' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'in_progress', started_at = now(), started_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.status = 'registration_closed';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;
