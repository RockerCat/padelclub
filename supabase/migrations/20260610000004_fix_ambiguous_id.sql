-- ============================================================
-- Sprint 1.5 — Fix 42702 "column reference id is ambiguous"
-- ============================================================
-- Root cause: create_club_with_owner() declares RETURNS TABLE (id uuid, slug text).
-- This creates OUT parameters named 'id' and 'slug' that are in scope throughout
-- the function body. Two statements reference bare 'id' and trigger 42702:
--
--   1. ON CONFLICT (id) DO NOTHING
--      → 'id' is ambiguous: profiles.id column vs OUT parameter 'id'
--
--   2. RETURNING clubs.id INTO v_club_id
--      → 'id' is table-qualified but PostgreSQL still flags it in some versions
--
-- Fix A: ON CONFLICT ON CONSTRAINT profiles_pkey — uses constraint name,
--        no column reference, no ambiguity possible.
--
-- Fix B: Pre-generate UUID before INSERT — eliminates RETURNING clause entirely.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_club_with_owner(
  p_name text,
  p_slug text
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id uuid := gen_random_uuid();  -- pre-generate to avoid RETURNING ambiguity
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Ensure profile exists for users who signed up before the trigger was in place.
  -- Use constraint name instead of column name to avoid 42702 with OUT param 'id'.
  INSERT INTO public.profiles (id)
  VALUES (auth.uid())
  ON CONFLICT ON CONSTRAINT profiles_pkey DO NOTHING;

  -- Provide id explicitly so no RETURNING clause is needed.
  INSERT INTO public.clubs (id, name, slug)
  VALUES (v_club_id, p_name, p_slug);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_club_id, auth.uid(), 'OWNER', true);

  -- v_club_id and p_slug are local variables — no column reference, no ambiguity.
  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_with_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_with_owner(text, text) TO authenticated;
