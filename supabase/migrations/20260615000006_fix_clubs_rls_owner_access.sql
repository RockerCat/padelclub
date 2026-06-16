-- ============================================================
-- Ensure club owners can always read their own club, regardless
-- of visibility or other SELECT policy conditions.
--
-- Root cause: if clubs_select_active was replaced by a
-- clubs_select_public policy (visibility='public' filter),
-- owners of private clubs get 404 on dashboard load because
-- the layout's club lookup fails silently.
--
-- Fix: drop any stale visibility-filtered policy and ensure
-- the active-only policy covers all roles (anon + authenticated).
-- Additionally, add an explicit owner-can-always-read policy as
-- a safety net so members never lose access to their own club.
-- ============================================================

-- 1. Remove any stale policies that may have restricted reads by visibility
DROP POLICY IF EXISTS "clubs_select_public"  ON public.clubs;
DROP POLICY IF EXISTS "clubs_select_active"  ON public.clubs;

-- 2. Restore the correct policy: any active club is readable by anyone
CREATE POLICY "clubs_select_active"
  ON public.clubs FOR SELECT
  USING (is_active = true);

-- 3. Safety net: members can always read their own club even if
--    is_active is temporarily false (e.g., during maintenance).
--    Uses SECURITY DEFINER helper to avoid RLS recursion.
DROP POLICY IF EXISTS "clubs_select_own_member" ON public.clubs;

CREATE POLICY "clubs_select_own_member"
  ON public.clubs FOR SELECT
  TO authenticated
  USING (public.is_club_member(id));
