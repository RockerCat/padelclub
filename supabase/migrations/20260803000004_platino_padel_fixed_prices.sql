-- ============================================================
-- Platino Pádel (alex-club-padel) — real fixed 90-minute prices
-- Mi Pádel Club
-- ============================================================
-- Verified against the live project before writing this migration:
-- alex-club-padel.allowed_reservation_durations is already exactly {90}
-- — left untouched here, since it's already correct.
--
-- The three general rules are identified by club + general scope
-- (court_id IS NULL) + days_of_week + start_time — never by name (the
-- editable "Horario diurno"/"Horario nocturno"/"Fin de semana" labels) and
-- deliberately never by end_time either, since this migration itself
-- changes end_time for two of them — matching on end_time would make a
-- second run of this same file unable to find the rows it already
-- updated. start_time is stable and, thanks to the overlap-prevention
-- trigger (check_pricing_rule_overlap), unique per (club, scope, day) for
-- active general rules — safe to key on alone.
--
-- Horario nocturno and Fin de semana currently end at 00:00; Platino's
-- real published hours are 18:00–23:00 and 06:00–23:00, so their end_time
-- moves to 23:00 (idempotent — a re-run finds it already at 23:00 and
-- updates nothing). club_operating_hours is NOT touched here — verified
-- separately that alex-club-padel's actual operating hours (lun-vie
-- 06:00–22:00, miércoles 06:00–20:30, sábado 08:00–18:00, domingo
-- CERRADO) already independently cap which start times are actually
-- bookable; the pricing rule's end_time only decides which tariff bucket
-- a start time falls into; a reservation still can't be created past
-- operating hours regardless of this value, and that check is unchanged.
--
-- Note found during verification: club_operating_hours has Sunday
-- (day_of_week=0) marked is_open=false for this club, while "Fin de
-- semana" prices both Saturday and Sunday — a pre-existing inconsistency
-- (Platino's marketing says "fin de semana" but the real operating-hours
-- configuration currently closes Sunday). Not fixed here — modifying
-- operating hours is explicitly out of scope for this task.
--
-- Applies ONLY to alex-club-padel — no other club's rules or durations
-- are touched by this file.
-- ============================================================

DO $$
DECLARE
  v_club_id        uuid;
  v_diurno_id      uuid;
  v_nocturno_id    uuid;
  v_findesemana_id uuid;
BEGIN
  SELECT id INTO v_club_id FROM public.clubs WHERE slug = 'alex-club-padel';
  IF v_club_id IS NULL THEN
    RAISE NOTICE 'alex-club-padel no encontrado — omitiendo precios de Platino Pádel';
    RETURN;
  END IF;

  SELECT id INTO v_diurno_id FROM public.club_pricing_rules
  WHERE club_id = v_club_id AND court_id IS NULL
    AND days_of_week = ARRAY[1,2,3,4,5] AND start_time = '06:00:00';

  SELECT id INTO v_nocturno_id FROM public.club_pricing_rules
  WHERE club_id = v_club_id AND court_id IS NULL
    AND days_of_week = ARRAY[1,2,3,4,5] AND start_time = '18:00:00';

  SELECT id INTO v_findesemana_id FROM public.club_pricing_rules
  WHERE club_id = v_club_id AND court_id IS NULL
    AND days_of_week = ARRAY[0,6] AND start_time = '06:00:00';

  IF v_nocturno_id IS NOT NULL THEN
    UPDATE public.club_pricing_rules SET end_time = '23:00:00'
    WHERE id = v_nocturno_id AND end_time <> '23:00:00';
  ELSE
    RAISE NOTICE 'Regla "Horario nocturno" (lun-vie, inicio 18:00) no encontrada para alex-club-padel';
  END IF;

  IF v_findesemana_id IS NOT NULL THEN
    UPDATE public.club_pricing_rules SET end_time = '23:00:00'
    WHERE id = v_findesemana_id AND end_time <> '23:00:00';
  ELSE
    RAISE NOTICE 'Regla "Fin de semana" (sáb-dom, inicio 06:00) no encontrada para alex-club-padel';
  END IF;

  IF v_diurno_id IS NULL THEN
    RAISE NOTICE 'Regla "Horario diurno" (lun-vie, inicio 06:00) no encontrada para alex-club-padel';
  END IF;

  -- Fixed 90-minute prices (Platino only offers 90 minutes).
  IF v_diurno_id IS NOT NULL THEN
    INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
    VALUES (v_diurno_id, 90, 70000, 'COP')
    ON CONFLICT (pricing_rule_id, duration_minutes)
    DO UPDATE SET price_amount = EXCLUDED.price_amount, currency = EXCLUDED.currency, updated_at = now();
  END IF;

  IF v_nocturno_id IS NOT NULL THEN
    INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
    VALUES (v_nocturno_id, 90, 120000, 'COP')
    ON CONFLICT (pricing_rule_id, duration_minutes)
    DO UPDATE SET price_amount = EXCLUDED.price_amount, currency = EXCLUDED.currency, updated_at = now();
  END IF;

  IF v_findesemana_id IS NOT NULL THEN
    INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
    VALUES (v_findesemana_id, 90, 100000, 'COP')
    ON CONFLICT (pricing_rule_id, duration_minutes)
    DO UPDATE SET price_amount = EXCLUDED.price_amount, currency = EXCLUDED.currency, updated_at = now();
  END IF;
END $$;
