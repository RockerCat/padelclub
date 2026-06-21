-- ============================================================
-- Add player category (skill level) to club_members
--
-- Manually assigned by club admins for now — no automatic
-- calculation. Defaults to "Principiante" for new members.
-- Powers the category badge on player cards and the player's
-- "Información deportiva" section, and prepares the schema for
-- future rankings/tournaments features.
-- ============================================================

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Principiante'
  CHECK (category IN ('Principiante', '5ta', '4ta', '3ra', '2da', '1ra'));
