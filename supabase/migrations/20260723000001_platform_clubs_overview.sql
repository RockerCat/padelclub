-- ============================================================
-- Platform Admin — global clubs overview (read-only)
-- Mi Pádel Club
-- ============================================================
-- Purpose:
--   The platform admin screen needs to list ALL clubs (including
--   inactive ones) with owner name/email and player/court counts.
--   clubs_select_active only exposes active clubs, club_members
--   is scoped to the caller's own memberships, and auth.users is
--   never exposed via PostgREST — so none of this is readable by
--   a platform admin through the normal authenticated client.
--
--   Rather than touching any existing RLS policy, this follows the
--   same SECURITY DEFINER RPC pattern already used by
--   create_club_with_owner / get_public_clubs / join_public_club:
--   a function that runs with elevated privilege but is gated by
--   an explicit is_platform_admin check inside its own body, so
--   calling the RPC directly (bypassing the app layout) still
--   returns zero rows for anyone who isn't a platform admin.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_platform_clubs_overview()
RETURNS TABLE (
  id           uuid,
  name         text,
  slug         text,
  visibility   text,
  is_active    boolean,
  created_at   timestamptz,
  owner_name   text,
  owner_email  text,
  player_count bigint,
  court_count  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    c.id,
    c.name,
    c.slug,
    c.visibility,
    c.is_active,
    c.created_at,
    p.full_name AS owner_name,
    u.email     AS owner_email,
    (SELECT count(*) FROM public.club_members pc
       WHERE pc.club_id = c.id AND pc.role = 'PLAYER' AND pc.is_active = true) AS player_count,
    (SELECT count(*) FROM public.courts ct
       WHERE ct.club_id = c.id AND ct.is_active = true) AS court_count
  FROM public.clubs c
  LEFT JOIN LATERAL (
    SELECT cm.profile_id
    FROM public.club_members cm
    WHERE cm.club_id = c.id AND cm.role = 'OWNER' AND cm.is_active = true
    ORDER BY cm.joined_at ASC
    LIMIT 1
  ) om ON true
  LEFT JOIN public.profiles p   ON p.id = om.profile_id
  LEFT JOIN auth.users     u    ON u.id = om.profile_id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  )
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_platform_clubs_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_clubs_overview() TO authenticated;
