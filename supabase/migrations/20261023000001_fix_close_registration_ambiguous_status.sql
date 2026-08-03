-- ============================================================
-- close_tournament_registration — fix ambiguous "status" column reference
-- Mi Pádel Club
-- ============================================================
-- Real error captured from the live RPC (not guessed):
--   code: 42702
--   message: column reference "status" is ambiguous
--   details: It could refer to either a PL/pgSQL variable or a table column.
--   hint: null
--
-- Same root cause class as the "club_id" ambiguity already fixed in
-- several sibling functions (20261013000001 through 20261019000001,
-- 20261021000001, 20261022000001): this function's RETURNS TABLE
-- declares a "status" output column, implicitly exposed by PL/pgSQL as a
-- bare variable name throughout the function body. The minimum-confirmed-
-- pairs check added in 20261015000001 (and carried forward unchanged into
-- 20261021000001) queries tournament_entries without an alias:
--
--   SELECT count(*) INTO v_confirmed_count
--   FROM public.tournament_entries
--   WHERE tournament_id = p_tournament_id AND status = 'confirmed';
--
-- making bare `status` ambiguous against the implicit RETURNS TABLE
-- variable — this is why OWNER/ADMIN closing registration always failed
-- with the generic message, even with enough confirmed pairs: the
-- exception fires before the pair count is ever compared.
--
-- Fix: alias tournament_entries as `te` and qualify `te.tournament_id`/
-- `te.status`. No other line changes: same authorization rules, same
-- min-pairs threshold, same status transition, same RETURNS TABLE shape.
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_tournament_registration(p_tournament_id uuid)
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
  updated_at                  timestamptz,
  archived_at                 timestamptz,
  archived_by                 uuid
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
    RAISE EXCEPTION 'Not authorized to close registration for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to close registration for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Only a tournament with open registration can be closed' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_confirmed_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_count < 2 THEN
    RAISE EXCEPTION 'At least 2 confirmed pairs are required to close registration' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_closed'
  WHERE t.id = p_tournament_id AND t.status = 'registration_open';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament registration is no longer open' USING ERRCODE = '22023';
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
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at,
    v_tournament.archived_at, v_tournament.archived_by;
END;
$$;
