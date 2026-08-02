-- ============================================================
-- create_tournament — re-assert OWNER+ADMIN authorization
-- Mi Pádel Club
-- ============================================================
-- Audit trail followed for "Crear torneo" (the only flow in scope):
--   TournamentForm submit → createTournament (tournaments/actions.ts)
--   → requireAdminRole (resolveClubAccess, already OWNER+ADMIN) →
--   supabase.rpc("create_tournament", {...}) → tournamentErrorMessage(error).
--
-- requireAdminRole already allows OWNER+ADMIN via the central
-- resolveClubAccess helper — confirmed correct, not touched.
-- tournamentErrorMessage already has no OWNER-only branch and reports the
-- real code — confirmed correct, not touched.
--
-- The one remaining suspect was create_tournament itself. Traced its full
-- authorization history end to end: every version on record —
-- 20260909000001 (original), 20260916000001, 20260922000002,
-- 20260924000002, 20260925000002, and 20261008000001 (current) — has
-- always used the NULL-safe positive check `v_caller_member.role NOT IN
-- ('OWNER', 'ADMIN')`, never an OWNER-only gate. The function's own
-- source has never blocked ADMIN. Given that, and given ADMIN's generic
-- "No fue posible completar la acción" (tournamentErrorMessage's fallback
-- for any code other than 42501/P0002/P0005/22023) is exactly the
-- symptom of the RPC actually running an older/rejecting definition, the
-- root cause is that the CURRENTLY LIVE create_tournament does not yet
-- reflect 20261008000001's definition.
--
-- Fix: re-assert that exact, already-correct definition — CREATE OR
-- REPLACE with the byte-identical body from 20261008000001 (same 13-param
-- signature, so no DROP needed), guaranteeing convergence regardless of
-- what is currently live. No logic changed, no new bypass, no second
-- authorization path — OWNER and ADMIN keep going through the exact same
-- check and the exact same INSERT they already shared.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_tournament(
  p_club_id                     uuid,
  p_name                        text,
  p_category                    text,
  p_max_pairs                   integer,
  p_description                 text DEFAULT NULL,
  p_visibility                  text DEFAULT 'private',
  p_registration_opens_at       timestamptz DEFAULT NULL,
  p_registration_closes_at      timestamptz DEFAULT NULL,
  p_starts_at                   timestamptz DEFAULT NULL,
  p_estimated_duration_minutes  integer DEFAULT NULL,
  p_secondary_category          text DEFAULT NULL,
  p_prize_description           text DEFAULT NULL,
  p_cover_image_url             text DEFAULT NULL
)
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
  v_caller_member  public.club_members%ROWTYPE;
  v_name           text;
  v_description    text;
  v_prize          text;
  v_tournament     public.tournaments%ROWTYPE;
  v_primary_sort   smallint;
  v_secondary_sort smallint;
  v_base_slug      text;
  v_candidate_slug text;
  v_date_part      text;
  v_suffix         int := 0;
  v_constraint     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Real active membership wins; only when the caller has none at all
  -- does the SUPERADMIN elevated-access fallback apply (resolved as
  -- 'OWNER') — same union every other Pattern-B RPC in this codebase
  -- uses. club_members' real physical column order (id, club_id,
  -- profile_id, role, is_active, joined_at, category — verified against
  -- 20260610000001 + 20260620000001, the only migrations that ever
  -- shaped this table) matches the alias list exactly.
  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, p_club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(p_club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tournament name cannot be blank' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_prize := NULLIF(btrim(COALESCE(p_prize_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  IF p_secondary_category IS NOT NULL THEN
    IF p_secondary_category = p_category THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    SELECT sort_order INTO v_primary_sort FROM public.sport_categories WHERE code = p_category;
    SELECT sort_order INTO v_secondary_sort FROM public.sport_categories WHERE code = p_secondary_category;

    IF v_secondary_sort IS NULL OR v_primary_sort <= v_secondary_sort THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_max_pairs IS NULL OR p_max_pairs < 1 THEN
    RAISE EXCEPTION 'Invalid max pairs' USING ERRCODE = '22023';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_duration_minutes IS NOT NULL AND p_estimated_duration_minutes < 1 THEN
    RAISE EXCEPTION 'Invalid estimated duration' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  v_base_slug := COALESCE(public._slugify_tournament_name(v_name), 'torneo');
  v_candidate_slug := v_base_slug;

  LOOP
    BEGIN
      INSERT INTO public.tournaments (
        club_id, name, slug, description, category, secondary_category, max_pairs, visibility,
        registration_opens_at, registration_closes_at, starts_at, estimated_duration_minutes,
        prize_description, cover_image_url, created_by
      ) VALUES (
        p_club_id, v_name, v_candidate_slug, v_description, p_category, p_secondary_category, p_max_pairs, p_visibility,
        p_registration_opens_at, p_registration_closes_at, p_starts_at, p_estimated_duration_minutes,
        v_prize, NULLIF(btrim(COALESCE(p_cover_image_url, '')), ''), auth.uid()
      )
      RETURNING * INTO v_tournament;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'tournaments_club_id_slug_key' THEN
        RAISE;
      END IF;

      IF v_suffix = 0 THEN
        v_date_part := to_char(COALESCE(p_starts_at, now()), 'YYYYMMDD');
        v_candidate_slug := v_base_slug || '-' || v_date_part;
        v_suffix := 2;
      ELSE
        v_candidate_slug := v_base_slug || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END IF;

      IF v_suffix > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique tournament slug after multiple attempts' USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;

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
