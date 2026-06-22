-- Idempotent fix for public-read RLS on courts and club_operating_hours,
-- diagnosed via direct REST calls with the anon key right after applying
-- 20260624000001 (which fixed the missing table-level GRANTs):
--
-- 1. courts: anon got 0 rows (no permission error) for an active+public
--    club. The "courts_select_active_club" policy from
--    20260615000005_clubs_all_active_read.sql isn't actually in effect in
--    this database, even though "clubs_select_active" from the very same
--    migration file clearly is. Re-asserting it here, idempotently,
--    regardless of why it diverged from the migration history.
--
-- 2. club_operating_hours: anon got "permission denied for table
--    club_members" — caused by the original "members_read_operating_hours"
--    policy (20260611000008_operating_hours.sql) still being present and
--    OR'd together with the newer active-club policy. Its USING clause
--    queries club_members directly (not via a SECURITY DEFINER function),
--    which anon has no grant for by design (privacy: member lists are not
--    publicly readable). Dropping it is safe — the broader
--    "operating_hours_select_active_club" policy already covers members
--    too, since any active club (including ones the caller belongs to) is
--    included.

DROP POLICY IF EXISTS "members_read_operating_hours" ON public.club_operating_hours;

DROP POLICY IF EXISTS "courts_select_active_club" ON public.courts;
CREATE POLICY "courts_select_active_club"
  ON public.courts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = courts.club_id
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS "operating_hours_select_active_club" ON public.club_operating_hours;
CREATE POLICY "operating_hours_select_active_club"
  ON public.club_operating_hours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_operating_hours.club_id
        AND c.is_active = true
    )
  );
