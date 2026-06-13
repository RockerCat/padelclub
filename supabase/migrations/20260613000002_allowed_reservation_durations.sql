-- Add allowed_reservation_durations to clubs
-- Defaults to [60, 90, 120] minutes (padel standard).
-- Only values in {60, 90, 120, 150, 180} are accepted.
-- Must contain at least one element.

ALTER TABLE public.clubs
  ADD COLUMN allowed_reservation_durations integer[]
    NOT NULL
    DEFAULT ARRAY[60, 90, 120];

ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_valid_durations
    CHECK (
      array_length(allowed_reservation_durations, 1) >= 1
      AND NOT EXISTS (
        SELECT 1 FROM unnest(allowed_reservation_durations) AS d
        WHERE d NOT IN (60, 90, 120, 150, 180)
      )
    );
