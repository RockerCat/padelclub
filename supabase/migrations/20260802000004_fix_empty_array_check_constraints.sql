-- ============================================================
-- Fix empty-array CHECK constraints silently passing
-- Mi Pádel Club
-- ============================================================
-- Found by live validation against the real database: inserting a
-- club_pricing_rules row with days_of_week = '{}' was NOT rejected,
-- even though club_pricing_rules_days_not_empty checks
-- "array_length(days_of_week, 1) >= 1".
--
-- Root cause: PostgreSQL's array_length(arr, 1) returns NULL (not 0)
-- for an empty array. "NULL >= 1" evaluates to NULL, and a CHECK
-- constraint only rejects a row when its expression evaluates to
-- FALSE — NULL is treated as satisfied, same as if the column itself
-- were NULL. So the empty-array case silently passed.
--
-- cardinality(arr) does not have this footgun — it returns 0 (not
-- NULL) for an empty array — so ">= 1" correctly evaluates to FALSE
-- and the row is rejected.
--
-- clubs_valid_durations (20260802000003, itself replacing the
-- original 20260613000002) has the exact same array_length pattern
-- and therefore the same latent bug for an empty
-- allowed_reservation_durations array. Fixed here proactively for
-- consistency — not live-tested against a real club's data to avoid
-- writing a broken value into real club configuration just to prove
-- it, but the defect is identical and the fix is the same one-line
-- change.
--
-- These migrations were already applied manually via the SQL Editor
-- with the buggy CHECK — this file only repairs the constraint
-- in place, it does not touch any data.
-- ============================================================

ALTER TABLE public.club_pricing_rules
  DROP CONSTRAINT club_pricing_rules_days_not_empty;

ALTER TABLE public.club_pricing_rules
  ADD CONSTRAINT club_pricing_rules_days_not_empty
    CHECK (cardinality(days_of_week) >= 1);

ALTER TABLE public.clubs
  DROP CONSTRAINT clubs_valid_durations;

ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_valid_durations
    CHECK (
      cardinality(allowed_reservation_durations) >= 1
      AND allowed_reservation_durations <@ ARRAY[60, 90, 120]
    );
