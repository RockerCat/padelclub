-- ============================================================
-- Migrate existing club_pricing_rules.price_per_hour into
-- club_pricing_rule_prices — one row per duration the rule's club
-- currently allows
-- Mi Pádel Club
-- ============================================================
-- Preserves every club's existing effective pricing (proportional to the
-- old price_per_hour) as real, explicit per-duration rows, so nothing
-- changes for any club until its OWNER edits a rule through the new UI.
-- Only creates rows for durations actually in that club's
-- allowed_reservation_durations — a club offering only {90} gets only a
-- 90-minute price per rule, never 60/120 rows it doesn't offer.
--
-- Idempotent: ON CONFLICT (pricing_rule_id, duration_minutes) DO NOTHING
-- means re-running this migration never overwrites a price a real OWNER
-- may have already edited through the app in the meantime, and never
-- duplicates rows.
--
-- Does not touch reservations — historical price_amount/price_currency/
-- pricing_rule_id/price_calculated_at on existing reservation rows are
-- untouched by this migration.
-- ============================================================

DO $$
DECLARE
  v_rule            record;
  v_club_durations  integer[];
BEGIN
  FOR v_rule IN
    SELECT r.id, r.club_id, r.price_per_hour, r.currency
    FROM public.club_pricing_rules r
  LOOP
    SELECT allowed_reservation_durations INTO v_club_durations
    FROM public.clubs WHERE id = v_rule.club_id;

    IF v_club_durations IS NULL OR array_length(v_club_durations, 1) IS NULL THEN
      v_club_durations := ARRAY[60, 90, 120];
    END IF;

    IF v_rule.price_per_hour IS NULL THEN
      -- No legacy hourly rate to derive from (shouldn't happen for any
      -- rule created before this migration, but guards against a rule
      -- created after price_per_hour became nullable with no prices set
      -- some other way) — nothing to migrate for this rule.
      CONTINUE;
    END IF;

    IF 60 = ANY(v_club_durations) THEN
      INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
      VALUES (v_rule.id, 60, ROUND(v_rule.price_per_hour * 1, 2), v_rule.currency)
      ON CONFLICT (pricing_rule_id, duration_minutes) DO NOTHING;
    END IF;

    IF 90 = ANY(v_club_durations) THEN
      INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
      VALUES (v_rule.id, 90, ROUND(v_rule.price_per_hour * 1.5, 2), v_rule.currency)
      ON CONFLICT (pricing_rule_id, duration_minutes) DO NOTHING;
    END IF;

    IF 120 = ANY(v_club_durations) THEN
      INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
      VALUES (v_rule.id, 120, ROUND(v_rule.price_per_hour * 2, 2), v_rule.currency)
      ON CONFLICT (pricing_rule_id, duration_minutes) DO NOTHING;
    END IF;
  END LOOP;
END $$;
