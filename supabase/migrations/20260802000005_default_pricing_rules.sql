-- ============================================================
-- Default pricing rules for all existing clubs
-- Mi Pádel Club
-- ============================================================
-- Provisional tariffs so the reservation flow can be validated
-- end-to-end while the real configuration UI is still being built.
-- Every existing club (queried live from `clubs`, never a hardcoded
-- id) gets exactly three general rules (court_id IS NULL):
--
--   Horario diurno    lun-vie 06:00-18:00  $80.000/h COP  display_order 10
--   Horario nocturno  lun-vie 18:00-00:00  $100.000/h COP display_order 20
--   Fin de semana     sáb-dom 06:00-00:00  $120.000/h COP display_order 30
--
-- Applied to every club regardless of is_active — same convention as
-- courts/club_operating_hours in this schema: deactivating a club
-- doesn't strip its configuration, only hides it, so a reactivated
-- club should find its tariffs already in place rather than empty.
--
-- Idempotent and safe against partial/manual/test configuration
-- already present in club_pricing_rules:
--   - A club/scope that already has a general rule with the exact
--     same days_of_week + start_time + end_time (active OR inactive)
--     is skipped for that specific default rule — never duplicated,
--     never touched.
--   - A club that already has an ACTIVE general rule whose day+time
--     range merely overlaps a default (without matching it exactly)
--     is also skipped for that default — inserting it would be
--     rejected by check_pricing_rule_overlap anyway, and this
--     migration must never fail as a whole because one club has a
--     partial existing configuration. The overlap test mirrors
--     check_pricing_rule_overlap exactly (day arrays intersect AND
--     half-open [start,end) time ranges intersect, with end_time =
--     '00:00:00' treated as 24:00), so nothing unsafe is ever
--     attempted — this is a pre-filter, not exception handling.
--   - Existing rules are never modified, deactivated or deleted.
--
-- RAISE NOTICE lines report exactly which club/rule was inserted vs.
-- skipped (and why) — visible in the SQL Editor's output when this
-- migration runs.
-- ============================================================

DO $$
DECLARE
  v_club   record;
  v_rule   record;
  v_exact_exists   boolean;
  v_overlap_exists boolean;
  v_inserted_count integer := 0;
  v_skipped_count  integer := 0;
BEGIN
  FOR v_club IN SELECT id, slug FROM public.clubs ORDER BY slug LOOP
    FOR v_rule IN
      SELECT * FROM (VALUES
        ('Horario diurno',   ARRAY[1,2,3,4,5]::integer[], '06:00:00'::time, '18:00:00'::time, 80000::numeric(10,2),  10),
        ('Horario nocturno', ARRAY[1,2,3,4,5]::integer[], '18:00:00'::time, '00:00:00'::time, 100000::numeric(10,2), 20),
        ('Fin de semana',    ARRAY[6,0]::integer[],       '06:00:00'::time, '00:00:00'::time, 120000::numeric(10,2), 30)
      ) AS d(name, days_of_week, start_time, end_time, price_per_hour, display_order)
    LOOP
      -- Same scope + exact same days/time already configured (active or
      -- inactive) — never insert a second, equivalent row.
      SELECT EXISTS (
        SELECT 1 FROM public.club_pricing_rules e
        WHERE e.club_id = v_club.id
          AND e.court_id IS NULL
          AND e.days_of_week = v_rule.days_of_week
          AND e.start_time = v_rule.start_time
          AND e.end_time = v_rule.end_time
      ) INTO v_exact_exists;

      IF v_exact_exists THEN
        RAISE NOTICE 'OMITIDO (regla equivalente ya existe): club=% regla=%', v_club.slug, v_rule.name;
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      -- Any ACTIVE general rule for this club that partially overlaps
      -- this default in day+time (but isn't an exact match, already
      -- ruled out above) — skip rather than let the overlap trigger
      -- reject the whole statement.
      SELECT EXISTS (
        SELECT 1 FROM public.club_pricing_rules e
        WHERE e.club_id = v_club.id
          AND e.court_id IS NULL
          AND e.is_active = true
          AND e.days_of_week && v_rule.days_of_week
          AND (EXTRACT(HOUR FROM e.start_time)::integer * 60 + EXTRACT(MINUTE FROM e.start_time)::integer)
              < (CASE WHEN v_rule.end_time = '00:00:00'::time THEN 1440
                      ELSE EXTRACT(HOUR FROM v_rule.end_time)::integer * 60 + EXTRACT(MINUTE FROM v_rule.end_time)::integer
                 END)
          AND (EXTRACT(HOUR FROM v_rule.start_time)::integer * 60 + EXTRACT(MINUTE FROM v_rule.start_time)::integer)
              < (CASE WHEN e.end_time = '00:00:00'::time THEN 1440
                      ELSE EXTRACT(HOUR FROM e.end_time)::integer * 60 + EXTRACT(MINUTE FROM e.end_time)::integer
                 END)
      ) INTO v_overlap_exists;

      IF v_overlap_exists THEN
        RAISE NOTICE 'OMITIDO (solapa con una regla general activa existente): club=% regla=%', v_club.slug, v_rule.name;
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.club_pricing_rules
        (club_id, court_id, name, days_of_week, start_time, end_time, price_per_hour, currency, display_order, is_active)
      VALUES
        (v_club.id, NULL, v_rule.name, v_rule.days_of_week, v_rule.start_time, v_rule.end_time, v_rule.price_per_hour, 'COP', v_rule.display_order, true);

      RAISE NOTICE 'INSERTADA: club=% regla=%', v_club.slug, v_rule.name;
      v_inserted_count := v_inserted_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE '--- Resumen: % reglas insertadas, % omitidas ---', v_inserted_count, v_skipped_count;
END $$;
