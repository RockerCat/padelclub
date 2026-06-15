-- ============================================================
-- Allow public reads of courts for public+active clubs
--
-- The existing "courts_select_member" policy only allows members
-- to read courts. For the public club detail page (/clubs/[slug])
-- we need anonymous visitors to see basic court info (count, names)
-- so they can evaluate the club before creating an account.
--
-- RLS policies are additive (OR'd), so members retain full access
-- via the existing policy. This policy adds a second condition
-- that opens reads for clubs with visibility = 'public'.
-- ============================================================

CREATE POLICY "courts_select_public_club"
  ON public.courts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id    = courts.club_id
        AND c.is_active   = true
        AND c.visibility  = 'public'
    )
  );
