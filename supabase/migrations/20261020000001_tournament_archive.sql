-- ============================================================
-- Tournament archival — minimal persistence + RPCs
-- Mi Pádel Club
-- ============================================================
-- Audited first: no archival support exists anywhere for tournaments
-- (no archived_at/archived_by column, no archive_tournament/
-- restore_tournament function, no "archived" status value). This adds
-- exactly the minimal shape already established elsewhere in this
-- schema for the same concept — clubs.archived_at (Club Archival
-- Principles) and tournaments' own cancelled_at/cancelled_by,
-- completed_at/completed_by, started_at/started_by pairs.
--
-- Deliberately NOT a new `status` value: archiving is orthogonal to the
-- sporting lifecycle. A tournament's `status` never changes when
-- archived or restored — only archived_at/archived_by toggle. This is
-- exactly why "restaurar vuelve automáticamente al tab correspondiente
-- según su estado" requires zero extra logic: the tournament was always
-- 'completed' or 'cancelled', it just also carries an archived_at
-- timestamp for that window, and clearing it is the only change restore
-- makes.
--
-- Two new RPCs mirror the exact same authorization/locking pattern every
-- other tournament lifecycle RPC in this schema already uses
-- (SELECT ... FOR UPDATE on the tournament row, the OWNER+ADMIN
-- authorization lookup with the SUPERADMIN elevated-access fallback —
-- written correctly aliased from the start here, matching the fix
-- already applied to the six sibling functions that had the ambiguous
-- "club_id" bug). No new bypass, no new authorization path.
-- ============================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id);


-- ─── archive_tournament ──────────────────────────────────────────────────────
-- OWNER/ADMIN only. Only a 'completed' or 'cancelled' tournament can be
-- archived (matches "OWNER y ADMIN pueden archivar torneos finalizados o
-- cancelados") — never draft/registration_open/registration_closed/
-- in_progress, and never twice (archived_at IS NULL required). Nothing
-- about the tournament's sporting data (entries, points, classification,
-- news) is touched — this is purely a visibility toggle for the admin
-- listing.
CREATE OR REPLACE FUNCTION public.archive_tournament(p_tournament_id uuid)
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
  v_tournament    public.tournaments%ROWTYPE;
  v_caller_member public.club_members%ROWTYPE;
  v_updated_count int;
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
    RAISE EXCEPTION 'Not authorized to archive this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to archive this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Only a completed or cancelled tournament can be archived' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tournament is already archived' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET archived_at = now(), archived_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.archived_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament is already archived' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.archive_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_tournament(uuid) TO authenticated;


-- ─── restore_tournament ──────────────────────────────────────────────────────
-- OWNER/ADMIN only. Clears archived_at/archived_by — status is never
-- touched, so the tournament reappears exactly where it already belonged
-- (Finalizados or Cancelados), with zero extra logic needed.
CREATE OR REPLACE FUNCTION public.restore_tournament(p_tournament_id uuid)
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
  v_tournament    public.tournaments%ROWTYPE;
  v_caller_member public.club_members%ROWTYPE;
  v_updated_count int;
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
    RAISE EXCEPTION 'Not authorized to restore this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to restore this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.archived_at IS NULL THEN
    RAISE EXCEPTION 'Tournament is not archived' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET archived_at = NULL, archived_by = NULL
  WHERE t.id = p_tournament_id AND t.archived_at IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament is not archived' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.restore_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_tournament(uuid) TO authenticated;


-- ─── tournaments_select_admin — widen to include archived_at column ─────────
-- No RLS policy change needed: existing SELECT policies already expose
-- the full row (SELECT *), so archived_at/archived_by are automatically
-- readable by whoever could already read the tournament. Nothing to do
-- here — this comment exists only to record that this was checked, not
-- to add a statement.
