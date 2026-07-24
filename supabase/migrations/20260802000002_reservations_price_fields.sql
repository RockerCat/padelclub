-- ============================================================
-- reservations — frozen price fields (schema only)
-- Mi Pádel Club
-- ============================================================
-- A reservation's price must never drift when the club later edits its
-- tariffs — so the resolved price is captured on the reservation itself,
-- not re-derived from club_pricing_rules on every read. This migration
-- only adds the columns; no flow (requestReservation, createReservation,
-- updateReservation, approvePendingReservation) writes to them yet.
--
-- All columns are nullable with no default — every existing reservation
-- stays exactly as it is (NULL price fields). NULL means "no tariff was
-- resolved for this reservation", and must be treated as that by any
-- future UI — never backfilled with an invented price, never defaulted
-- to 0 (0 would be indistinguishable from a genuinely free reservation).
-- ============================================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS price_amount        numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_currency       text,
  ADD COLUMN IF NOT EXISTS pricing_rule_id      uuid REFERENCES public.club_pricing_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_calculated_at  timestamptz;
