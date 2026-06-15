-- ============================================================
-- Fix clubs public read policy
--
-- Replace the generic clubs_select_active policy (which only
-- filtered by is_active) with a tighter clubs_select_public
-- policy that also requires visibility = 'public'.
--
-- The old policy already had no TO clause (applies to PUBLIC
-- including anon), but the directory query was filtering on
-- visibility anyway. This makes the policy match the query.
-- ============================================================

DROP POLICY IF EXISTS "clubs_select_active" ON public.clubs;
DROP POLICY IF EXISTS "clubs_select_public"  ON public.clubs;

CREATE POLICY "clubs_select_public"
  ON public.clubs
  FOR SELECT
  USING (
    is_active  = true
    AND visibility = 'public'
  );
