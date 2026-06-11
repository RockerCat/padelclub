-- ============================================================
-- Sprint 3 — Club visibility: public discovery + self-join
-- ============================================================

-- 1. Add visibility column to clubs (default: public for existing clubs)
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private'));

-- 2. Drop old 2-param create_club_with_owner, replace with 3-param version
--    (p_visibility defaults to 'public' — backward-compatible)
DROP FUNCTION IF EXISTS public.create_club_with_owner(text, text);

CREATE OR REPLACE FUNCTION public.create_club_with_owner(
  p_name text,
  p_slug text,
  p_visibility text DEFAULT 'public'
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility value' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (auth.uid())
  ON CONFLICT ON CONSTRAINT profiles_pkey DO NOTHING;

  INSERT INTO public.clubs (id, name, slug, visibility)
  VALUES (v_club_id, p_name, p_slug, p_visibility);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_club_id, auth.uid(), 'OWNER', true);

  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_with_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_with_owner(text, text, text) TO authenticated;

-- 3. Public club discovery (returns public clubs the caller is NOT a member of)
CREATE OR REPLACE FUNCTION public.get_public_clubs()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  description text,
  logo_url text,
  primary_color text,
  secondary_color text,
  member_count bigint,
  court_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    c.id,
    c.name,
    c.slug,
    c.description,
    c.logo_url,
    c.primary_color,
    c.secondary_color,
    COUNT(DISTINCT cm.id) FILTER (WHERE cm.is_active = true) AS member_count,
    COUNT(DISTINCT ct.id) FILTER (WHERE ct.is_active = true) AS court_count
  FROM public.clubs c
  LEFT JOIN public.club_members cm ON cm.club_id = c.id
  LEFT JOIN public.courts ct ON ct.club_id = c.id
  WHERE c.is_active = true
    AND c.visibility = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM public.club_members my_cm
      WHERE my_cm.club_id = c.id
        AND my_cm.profile_id = auth.uid()
        AND my_cm.is_active = true
    )
  GROUP BY c.id, c.name, c.slug, c.description, c.logo_url, c.primary_color, c.secondary_color
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_clubs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_clubs() TO authenticated;

-- 4. Self-join a public club (SECURITY DEFINER to bypass club_members_insert policy)
CREATE OR REPLACE FUNCTION public.join_public_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_visibility text;
  v_already_member boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT visibility INTO v_visibility
  FROM public.clubs
  WHERE id = p_club_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  IF v_visibility != 'public' THEN
    RAISE EXCEPTION 'Club is not open for public joining' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND profile_id = auth.uid()
      AND is_active = true
  ) INTO v_already_member;

  -- Idempotent: already a member is a no-op
  IF v_already_member THEN
    RETURN;
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (p_club_id, auth.uid(), 'PLAYER', true);
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_public_club(uuid) TO authenticated;
