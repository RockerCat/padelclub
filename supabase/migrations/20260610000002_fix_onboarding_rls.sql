-- ============================================================
-- Sprint 1.5 — Fix onboarding RLS bootstrap problem
-- ============================================================
-- Problem 1: clubs had no INSERT policy → any insert was blocked by RLS.
-- Problem 2: club_members INSERT policy checks auth.club_role(), but on the
--            first insert (bootstrap) the caller has no membership yet,
--            so auth.club_role() returns NULL → insert blocked.
--
-- Solution: SECURITY DEFINER function that does both inserts atomically.
-- The function runs as its owner (postgres/service role), bypassing RLS,
-- while still using auth.uid() to identify the caller.
-- ============================================================


-- ─── create_club_with_owner ─────────────────────────────────────────────────
-- Atomically creates a club and inserts the caller as OWNER.
-- Called from the onboarding Server Action via .rpc().
--
-- Returns: TABLE (id uuid, slug text) — the new club's identity.

CREATE OR REPLACE FUNCTION public.create_club_with_owner(
  p_name text,
  p_slug text
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id uuid;
BEGIN
  -- Validate caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Insert the club (slug CHECK constraint still applies)
  INSERT INTO public.clubs (name, slug)
  VALUES (p_name, p_slug)
  RETURNING clubs.id INTO v_club_id;

  -- Insert the caller as OWNER — bootstrap, so no prior membership needed
  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_club_id, auth.uid(), 'OWNER', true);

  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

-- Revoke public execute, grant only to authenticated users
REVOKE ALL ON FUNCTION public.create_club_with_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_with_owner(text, text) TO authenticated;
