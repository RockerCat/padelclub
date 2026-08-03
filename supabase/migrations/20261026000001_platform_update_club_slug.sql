-- ============================================================
-- SUPERADMIN "Cambiar slug"
-- Mi Pádel Club
-- ============================================================
-- Lets a SUPERADMIN change any club's slug — e.g. to free up an
-- identifier for reuse — without touching owner, membership,
-- configuration or club_id. Same auth pattern as platform_deactivate_club/
-- platform_reactivate_club: re-derives SUPERADMIN authorization directly
-- from profiles.is_platform_admin, never trusts the caller.
--
-- Availability is checked explicitly here for a friendly error, but the
-- existing clubs_slug_key UNIQUE constraint (unchanged, 20260610000001)
-- remains the actual race-proof guard — a concurrent claim of the same
-- slug still raises 23505 from the UPDATE itself. Format is unchanged
-- too: the existing clubs_slug_format CHECK constraint already applies to
-- UPDATE the same as INSERT, so no new validation is added at this layer;
-- the app server action re-validates format/reserved-slug the same way
-- create_club_with_owner's/platform_create_pending_club's callers already
-- do, reusing SLUG_REGEX/RESERVED_SLUGS (src/lib/clubSlugs.ts) rather than
-- a second copy of that logic.
--
-- RETURNS TABLE (id uuid, slug text) — every reference to either name
-- inside the body is qualified (c.id/c.slug, or the function's own
-- parameters) to avoid the exact bare-column-vs-OUT-variable ambiguity
-- documented in CLAUDE.md's Tournament Module Principles.
CREATE OR REPLACE FUNCTION public.platform_update_club_slug(
  p_club_id  uuid,
  p_new_slug text
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_old_slug text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT c.slug INTO v_old_slug
  FROM public.clubs AS c
  WHERE c.id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_new_slug = v_old_slug THEN
    RAISE EXCEPTION 'New slug must be different from the current one' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clubs AS c2 WHERE c2.slug = p_new_slug) THEN
    RAISE EXCEPTION 'Slug already in use' USING ERRCODE = '23505';
  END IF;

  UPDATE public.clubs AS c
  SET slug = p_new_slug
  WHERE c.id = p_club_id;

  RETURN QUERY SELECT p_club_id, p_new_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_club_slug(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_update_club_slug(uuid, text) TO authenticated;
