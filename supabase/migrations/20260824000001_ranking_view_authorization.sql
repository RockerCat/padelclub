-- ============================================================
-- Ranking view authorization — Fase 1 (Módulo deportivo), bloque 6
-- Mi Pádel Club
-- ============================================================
-- Corrected revision: the first attempt tried to add avatar_url to
-- public.get_club_category_ranking(uuid, text) via CREATE OR REPLACE
-- FUNCTION. PostgreSQL rejects that (SQLSTATE 42P13, "cannot change
-- return type of existing function... Row type defined by OUT parameters
-- is different") — CREATE OR REPLACE FUNCTION can change a function's
-- body freely, but never the shape of a RETURNS TABLE(...) result once
-- the function exists; that requires DROP FUNCTION first, which is
-- explicitly avoided here since this RPC is already relied upon
-- internally by public.change_club_player_category (applied in
-- 20260823000001) and dropping it — even to immediately recreate it —
-- is unnecessary risk for something this migration can solve additively.
--
-- Corrected strategy, in one file (this migration was never applied, so
-- it is corrected in place rather than superseded by a new one):
--   1. public.get_club_category_ranking(uuid, text) keeps EXACTLY its
--      existing RETURNS TABLE shape (no avatar_url) — only CREATE OR
--      REPLACE FUNCTION to convert it to plpgsql and add authorization.
--      change_club_player_category's existing call to it is therefore
--      still fully compatible, untouched, not modified here.
--   2. A NEW function, public.get_club_category_ranking_view(uuid, text),
--      is the one and only place avatar_url is added — it composes the
--      original function (calls it internally) rather than duplicating
--      its query/authorization, and adds the avatar_url join on top. This
--      is the function the UI calls.
--   3. public.get_club_member_sport_state(uuid, uuid) keeps its existing
--      RETURNS TABLE untouched — only its self-read authorization branch
--      is corrected to also require is_active = true (missing from the
--      first attempt).
--
-- No DROP FUNCTION, no CASCADE, no table/data/trigger/RLS/cycle/points/
-- category change anywhere in this file.
-- ============================================================


-- ─── 1. get_club_category_ranking — authorization only, return type intact ──
-- Same audit findings as before: REVOKE ALL FROM PUBLIC with no grant to
-- authenticated, LANGUAGE sql with zero internal authorization, trusting
-- p_club_id blindly. Converted to plpgsql, gated with the existing
-- public.is_club_member(p_club_id) helper (Sprint 1, 20260610000001) —
-- any ACTIVE member of the club, any role, never anon, never a different
-- club. RETURNS TABLE is byte-for-byte the same 7 columns already applied
-- in 20260822000001 — no avatar_url here, so change_club_player_category
-- (which already calls this exact function, unaliased result columns
-- club_member_id/ranking_position) keeps working unmodified.
CREATE OR REPLACE FUNCTION public.get_club_category_ranking(
  p_club_id  uuid,
  p_category text
)
RETURNS TABLE (
  ranking_position  bigint,
  club_member_id    uuid,
  profile_id        uuid,
  full_name         text,
  category          text,
  current_points    integer,
  points_reached_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_club_member(p_club_id) THEN
    RAISE EXCEPTION 'Not authorized to view this club''s ranking' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    RANK() OVER (
      ORDER BY s.current_points DESC, s.points_reached_at ASC, s.club_member_id ASC
    ) AS ranking_position,
    s.club_member_id,
    cm.profile_id,
    p.full_name,
    c.category,
    s.current_points,
    s.points_reached_at
  FROM public.club_member_sport_state s
  JOIN public.club_ranking_cycles c ON c.id = s.cycle_id AND c.ended_at IS NULL
  JOIN public.club_members cm ON cm.id = s.club_member_id AND cm.club_id = s.club_id
  JOIN public.profiles p ON p.id = cm.profile_id
  WHERE s.club_id = p_club_id
    AND c.category = p_category
    AND cm.role = 'PLAYER'
    AND cm.is_active = true
  ORDER BY ranking_position;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_category_ranking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_category_ranking(uuid, text) TO authenticated;


-- ─── 2. get_club_category_ranking_view — new, UI-facing, adds avatar_url ────
-- Composes the function above (calls it, does not duplicate its query or
-- its authorization) and adds only what the UI needs on top: avatar_url.
-- Authorization is inherited for free — if the caller isn't authenticated
-- or isn't an active member of p_club_id, the inner call already raises
-- 42501 before this function does anything else, so there is nothing to
-- re-check here. Every column is explicitly aliased (r./p.) — this
-- function's own RETURNS TABLE shares several names (club_member_id,
-- category, current_points, points_reached_at) with real columns coming
-- through r./p., the exact class of bug already found and fixed in
-- 20260823000001, guarded against here from the start.
CREATE OR REPLACE FUNCTION public.get_club_category_ranking_view(
  p_club_id  uuid,
  p_category text
)
RETURNS TABLE (
  ranking_position  bigint,
  club_member_id    uuid,
  profile_id        uuid,
  full_name         text,
  avatar_url        text,
  category          text,
  current_points    integer,
  points_reached_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.ranking_position,
    r.club_member_id,
    r.profile_id,
    r.full_name,
    p.avatar_url,
    r.category,
    r.current_points,
    r.points_reached_at
  FROM public.get_club_category_ranking(p_club_id, p_category) AS r
  JOIN public.profiles p ON p.id = r.profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_category_ranking_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_category_ranking_view(uuid, text) TO authenticated;


-- ─── 3. get_club_member_sport_state — self-read fix now also requires
-- is_active = true ──────────────────────────────────────────────────────────
-- Same widened authorization as the previous attempt (OWNER/ADMIN can
-- still read anyone's state, unchanged; a member can additionally read
-- their own) — corrected to also require is_active = true on the
-- self-read branch, which the previous attempt omitted. Without it, a
-- deactivated PLAYER could still read their own (frozen) sport state via
-- self-read; every other membership check in this codebase requires
-- is_active = true, and this one now does too. RETURNS TABLE is
-- untouched. club_members referenced with an explicit alias (cm), same
-- qualification discipline as everywhere else, even though none of its
-- columns collide with this function's own RETURNS TABLE names.
CREATE OR REPLACE FUNCTION public.get_club_member_sport_state(
  p_club_id        uuid,
  p_club_member_id uuid
)
RETURNS TABLE (
  club_member_id    uuid,
  category          text,
  current_points    integer,
  points_reached_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_role := public.club_role(p_club_id);

  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
    -- Not an OWNER/ADMIN of this club — the only remaining legitimate case
    -- is an ACTIVE member reading their own sport state, never anyone
    -- else's, and never a deactivated membership's.
    IF NOT EXISTS (
      SELECT 1 FROM public.club_members AS cm
      WHERE cm.id = p_club_member_id
        AND cm.club_id = p_club_id
        AND cm.profile_id = auth.uid()
        AND cm.is_active = true
    ) THEN
      RAISE EXCEPTION 'Not authorized to read sport state for this club' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT s.club_member_id, c.category, s.current_points, s.points_reached_at
  FROM public.club_member_sport_state s
  JOIN public.club_ranking_cycles c ON c.id = s.cycle_id
  JOIN public.club_members cm ON cm.id = s.club_member_id
  WHERE s.club_member_id = p_club_member_id
    AND cm.club_id = p_club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_member_sport_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_member_sport_state(uuid, uuid) TO authenticated;
