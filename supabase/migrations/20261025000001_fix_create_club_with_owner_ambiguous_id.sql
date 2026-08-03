-- ============================================================
-- Fix: "Crear otro club" (and any create_club_with_owner call) fails with
-- [42702] column reference "id" is ambiguous
-- Mi Pádel Club
-- ============================================================
-- create_club_with_owner declares RETURNS TABLE (id uuid, slug text), so
-- PL/pgSQL implicitly exposes `id` as a bare OUT variable throughout the
-- whole function body (see CLAUDE.md's tournament-lifecycle note on this
-- exact pitfall — same root cause, different function). Two statements in
-- the body (unchanged since 20260809000001) reference a bare, unqualified
-- `id` in a WHERE clause against public.profiles, which is ambiguous
-- against that OUT variable under the default
-- plpgsql.variable_conflict = error:
--   SELECT account_type INTO v_account_type FROM public.profiles
--     WHERE id = auth.uid();                          -- ambiguous "id"
--   ...
--   UPDATE public.profiles SET account_type = 'OWNER'
--     WHERE id = auth.uid() AND account_type IS NULL;  -- ambiguous "id"
--
-- Fix: qualify both with the table name (profiles.id) — the minimal
-- change, no other line of the function touched. Everything else
-- (signature, validation order, INSERT column lists — already
-- unambiguous, since an INSERT's target column list is never resolved
-- against PL/pgSQL variables — RETURN QUERY shape, grants) is
-- byte-identical to 20260809000001.
-- ============================================================

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
  v_account_type text;
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

  SELECT account_type INTO v_account_type FROM public.profiles WHERE profiles.id = auth.uid();
  IF v_account_type IS NOT NULL AND v_account_type != 'OWNER' THEN
    RAISE EXCEPTION 'This account cannot create a club — its account type is already %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.clubs (id, name, slug, visibility)
  VALUES (v_club_id, p_name, p_slug, p_visibility);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_club_id, auth.uid(), 'OWNER', true);

  UPDATE public.profiles SET account_type = 'OWNER' WHERE profiles.id = auth.uid() AND account_type IS NULL;

  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_with_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_with_owner(text, text, text) TO authenticated;
