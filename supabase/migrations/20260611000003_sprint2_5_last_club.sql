-- ============================================================
-- Sprint 2.5 — Last Active Club
-- PadelClub
-- ============================================================
-- Adds last_club_id to profiles so the platform remembers
-- which club the user last entered. Simpler than a separate
-- user_preferences table — one column, no new joins.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN last_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

-- existing profiles_update_own policy covers this column:
--   ON public.profiles FOR UPDATE USING (id = auth.uid())
-- No new RLS policy needed.
