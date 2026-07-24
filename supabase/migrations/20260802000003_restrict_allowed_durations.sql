-- ============================================================
-- Restrict clubs.allowed_reservation_durations to {60, 90, 120}
-- Mi Pádel Club
-- ============================================================
-- clubs_valid_durations (20260613000002) accepted {60,90,120,150,180},
-- but reservations.duration_minutes only ever accepted {30,60,90,120}
-- (20260611000007 / 20260613000001) — a club could be configured to
-- offer 150 or 180 minutes and every resulting reservation insert would
-- fail. For the MVP, configurable durations are limited to exactly
-- {60, 90, 120}, matching the pricing engine's proportional calculation
-- (×1, ×1.5, ×2) and closing that gap at its source.
--
-- Verified against the live project before writing this migration: no
-- club currently has 150 or 180 in allowed_reservation_durations (all
-- five existing clubs are already within {60,90,120}, one of them a
-- subset {60,90}), so this narrower CHECK applies cleanly with no data
-- to fix up.
--
-- reservations.duration_minutes is untouched — its CHECK still allows
-- 30 (never widened, never narrowed here) so any historical 30-minute
-- reservation keeps reading correctly. 30 simply can no longer be
-- offered as a NEW configurable duration via allowed_reservation_durations,
-- consistent with src/lib/durations.ts's DURATION_CATALOG, which never
-- included 30 in the first place.
--
-- The replacement CHECK uses the array containment operator (<@) rather
-- than "NOT EXISTS (SELECT ... FROM unnest(...))" — that form (which the
-- original 20260613000002 migration also used) is rejected by PostgreSQL
-- with "cannot use subquery in check constraint", since CHECK constraints
-- may never contain a subquery, even one that only unnests the row's own
-- column. <@ is a plain array operator, not a subquery.
-- ============================================================

ALTER TABLE public.clubs
  DROP CONSTRAINT clubs_valid_durations;

ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_valid_durations
    CHECK (
      array_length(allowed_reservation_durations, 1) >= 1
      AND allowed_reservation_durations <@ ARRAY[60, 90, 120]
    );
