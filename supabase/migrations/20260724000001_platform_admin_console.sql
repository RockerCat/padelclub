-- ============================================================
-- Platform Admin console — clubs detail + users overview
-- Mi Pádel Club
-- ============================================================
-- Extends the read-only platform-admin RPC surface introduced in
-- 20260723000001_platform_clubs_overview.sql. Same rules apply:
--   - No existing RLS policy is touched.
--   - Every function is SECURITY DEFINER but gated internally on
--     profiles.is_platform_admin for auth.uid(), so calling any of
--     these RPCs directly (bypassing the app) still returns nothing
--     for a non-admin.
-- ============================================================

-- get_platform_clubs_overview: re-created (not just replaced) to add
-- logo_url — Postgres doesn't allow CREATE OR REPLACE to change the
-- output column list of a TABLE-returning function.
DROP FUNCTION IF EXISTS public.get_platform_clubs_overview();

CREATE FUNCTION public.get_platform_clubs_overview()
RETURNS TABLE (
  id           uuid,
  name         text,
  slug         text,
  logo_url     text,
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
    c.logo_url,
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
  LEFT JOIN public.profiles p ON p.id = om.profile_id
  LEFT JOIN auth.users     u ON u.id = om.profile_id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  )
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_platform_clubs_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_clubs_overview() TO authenticated;


-- get_platform_club_detail: single-club stats for /platform/clubs/[clubId].
CREATE OR REPLACE FUNCTION public.get_platform_club_detail(p_club_id uuid)
RETURNS TABLE (
  id                uuid,
  name              text,
  slug              text,
  logo_url          text,
  visibility        text,
  is_active         boolean,
  created_at        timestamptz,
  owner_name        text,
  owner_email       text,
  admin_count       bigint,
  player_count      bigint,
  reservation_count bigint,
  news_count        bigint,
  court_count       bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    c.id,
    c.name,
    c.slug,
    c.logo_url,
    c.visibility,
    c.is_active,
    c.created_at,
    p.full_name AS owner_name,
    u.email     AS owner_email,
    (SELECT count(*) FROM public.club_members am
       WHERE am.club_id = c.id AND am.role = 'ADMIN' AND am.is_active = true) AS admin_count,
    (SELECT count(*) FROM public.club_members pm
       WHERE pm.club_id = c.id AND pm.role = 'PLAYER' AND pm.is_active = true) AS player_count,
    (SELECT count(*) FROM public.reservations r
       WHERE r.club_id = c.id) AS reservation_count,
    (SELECT count(*) FROM public.club_news n
       WHERE n.club_id = c.id) AS news_count,
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
  LEFT JOIN public.profiles p ON p.id = om.profile_id
  LEFT JOIN auth.users     u ON u.id = om.profile_id
  WHERE c.id = p_club_id
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.is_platform_admin = true
    );
$$;

REVOKE ALL ON FUNCTION public.get_platform_club_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_club_detail(uuid) TO authenticated;


-- get_platform_users_overview: every registered user + their club
-- memberships/roles, for /platform/users. memberships is a small jsonb
-- array (a user belongs to few clubs) rather than a join that would
-- multiply rows per membership.
CREATE OR REPLACE FUNCTION public.get_platform_users_overview()
RETURNS TABLE (
  id                uuid,
  full_name         text,
  email             text,
  is_platform_admin boolean,
  created_at        timestamptz,
  memberships       jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    p.id,
    p.full_name,
    u.email,
    p.is_platform_admin,
    p.created_at,
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object('club_name', c.name, 'club_slug', c.slug, 'role', cm.role)
                ORDER BY c.name
              )
       FROM public.club_members cm
       JOIN public.clubs c ON c.id = cm.club_id
       WHERE cm.profile_id = p.id AND cm.is_active = true),
      '[]'::jsonb
    ) AS memberships
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  )
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_platform_users_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_users_overview() TO authenticated;
