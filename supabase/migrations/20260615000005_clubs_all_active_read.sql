-- ============================================================
-- Allow anonymous reads of all ACTIVE clubs (not just public)
--
-- Previous policy: clubs_select_public → USING (is_active=true AND visibility='public')
-- New policy:      clubs_select_active → USING (is_active=true)
--
-- Rationale: "visibility" controls whether a club appears in the
-- public directory, but ALL active clubs should be discoverable
-- (public: anyone can join; private: membership requires approval).
-- Hiding private clubs entirely prevents players from discovering
-- and requesting access to invite-style clubs.
--
-- The application layer still filters the directory by visibility
-- to let private clubs opt out of the directory listing. But if
-- someone has a direct URL they can see the club's landing page.
-- ============================================================

-- Clubs: replace visibility-gated policy with active-only
DROP POLICY IF EXISTS "clubs_select_public"  ON public.clubs;
DROP POLICY IF EXISTS "clubs_select_active"  ON public.clubs;

CREATE POLICY "clubs_select_active"
  ON public.clubs
  FOR SELECT
  USING (is_active = true);


-- Courts: allow reads for any active club (not just public)
DROP POLICY IF EXISTS "courts_select_public_club"  ON public.courts;
DROP POLICY IF EXISTS "courts_select_active_club"  ON public.courts;

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


-- Operating hours: allow reads for any active club (not just public)
DROP POLICY IF EXISTS "operating_hours_select_public_club"  ON public.club_operating_hours;
DROP POLICY IF EXISTS "operating_hours_select_active_club"  ON public.club_operating_hours;

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
