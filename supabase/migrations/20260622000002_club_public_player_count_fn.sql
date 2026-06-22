-- ============================================================
-- Public, privacy-safe player count for the public club page
--
-- club_members rows are only visible to active members of that same
-- club (policy "club_members_select" USING is_club_member(club_id),
-- which itself requires auth.uid() to already be a member) — an
-- anonymous visitor querying club_members directly would always get
-- 0 rows, showing a false "0 jugadores" on the public page.
--
-- Exposing a SELECT policy on club_members to anon would leak the
-- full member list (profile_id, role, etc.) — against the platform's
-- privacy principles. Instead, this SECURITY DEFINER function
-- returns only the aggregate count, same pattern as
-- is_club_member()/club_role() already use in this schema.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_active_players(p_club_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT count(*)::integer
  FROM public.club_members
  WHERE club_id = p_club_id
    AND role = 'PLAYER'
    AND is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.count_active_players(uuid) TO anon, authenticated;
