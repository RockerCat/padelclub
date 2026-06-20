-- ============================================================
-- Add geographic coordinates to clubs
--
-- Enables precise location on the public profile and
-- future proximity-based features. Both nullable so
-- existing clubs are unaffected.
-- ============================================================

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
