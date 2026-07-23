-- ============================================================
-- Platform Admin (Super Admin)
-- Mi Pádel Club
-- ============================================================
-- Adds a platform-level admin flag on profiles. This is orthogonal
-- to club_members.role: club roles (OWNER/ADMIN/PLAYER) remain the
-- only source of per-club permissions and are untouched by this
-- migration. is_platform_admin identifies a small number of people
-- who operate the platform itself, across all clubs.
--
-- No RLS policy changes here by design — that is a separate step.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- Grant platform admin to the existing user by email, resolved via
-- auth.users (profile id == auth.users id, not assumed).
UPDATE public.profiles p
SET is_platform_admin = true
FROM auth.users u
WHERE p.id = u.id
  AND u.email = 'alexsosa.me@gmail.com';
