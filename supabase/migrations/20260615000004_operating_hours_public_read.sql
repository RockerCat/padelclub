-- ============================================================
-- Allow public reads of operating hours for public+active clubs
--
-- Mirrors 20260615000003_courts_public_read.sql. The existing
-- "members_read_operating_hours" policy restricts reads to
-- club members only. For the public club detail page we need
-- anonymous visitors to see the club schedule so they can
-- evaluate the club before creating an account.
-- ============================================================

CREATE POLICY "operating_hours_select_public_club"
  ON public.club_operating_hours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id         = club_operating_hours.club_id
        AND c.is_active  = true
        AND c.visibility = 'public'
    )
  );
