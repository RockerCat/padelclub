-- ============================================================
-- Platform Admin — user detail + name edit
-- Mi Pádel Club
-- ============================================================
-- Adds the read/write surface needed by /platform/users/[userId]:
--   - get_platform_user_detail: single-user version of
--     get_platform_users_overview (20260724000001), plus
--     last_sign_in_at / is_banned read from auth.users — read-only,
--     no auth.users row is ever written from SQL.
--   - update_platform_user_name: the ONLY user-editing action that
--     touches profiles directly (name is not an Auth concern). Email,
--     password and ban/unban are handled exclusively via the Supabase
--     Admin API (supabase.auth.admin.*) from server actions, never
--     via SQL — see src/lib/supabase/admin.ts.
--
-- Same rules as the previous platform-admin migrations: no existing
-- RLS policy is touched; both functions are SECURITY DEFINER but
-- gated internally on profiles.is_platform_admin for auth.uid().
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_platform_user_detail(p_user_id uuid)
RETURNS TABLE (
  id                uuid,
  full_name         text,
  email             text,
  is_platform_admin boolean,
  created_at        timestamptz,
  last_sign_in_at   timestamptz,
  is_banned         boolean,
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
    u.last_sign_in_at,
    (u.banned_until IS NOT NULL AND u.banned_until > now()) AS is_banned,
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
  WHERE p.id = p_user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.is_platform_admin = true
    );
$$;

REVOKE ALL ON FUNCTION public.get_platform_user_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_user_detail(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_platform_user_name(p_user_id uuid, p_full_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET full_name = p_full_name
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_user_name(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_platform_user_name(uuid, text) TO authenticated;
