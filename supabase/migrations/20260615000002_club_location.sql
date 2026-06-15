-- ============================================================
-- Add location fields to clubs
--
-- Enables the public directory to show city/state and lets
-- owners configure their club's address for discoverability.
-- All columns are nullable so existing clubs are unaffected.
-- ============================================================

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS city    text,
  ADD COLUMN IF NOT EXISTS state   text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Colombia',
  ADD COLUMN IF NOT EXISTS address text;
