-- ============================================================
-- Club operational statistics — Phase 9
-- Mi Pádel Club
-- ============================================================
-- Read-only aggregated statistics for OWNER/ADMIN, computed entirely in
-- Postgres from real `reservations` rows — never approximated, never
-- downloaded raw to the client for browser-side math. No monetary metric
-- is computed here (price_amount is frequently NULL — admin-created
-- reservations are never priced at all — so no aggregate over it could
-- honestly be called "revenue").
--
-- Metric definitions (kept in one place, matched exactly by the RPC body
-- below — see each block's own comment for the precise rule):
--   totalReservations   — count of non-block reservations in range, any status
--   confirmed/pending    — count with that status, non-block
--   cancelledOrRejected  — count with status IN ('cancelled','rejected'), non-block
--   reservedMinutes      — sum(duration_minutes) of CONFIRMED non-block reservations
--   dailyAverage         — totalReservations / calendar days in range (not just active days)
--   confirmationRate     — confirmed / totalReservations * 100, 0 when totalReservations = 0
-- `type = 'block'` (operational court blocks, not player/admin reservations)
-- is excluded from every single metric in this phase — see the CLAUDE.md-
-- style rationale in the task this migration implements: a block is not a
-- reservation of anyone's court time.
-- ============================================================

-- ─── Private helper: OWNER/ADMIN authorization for a club's statistics ────
-- Mirrors _require_club_not_archived's shape (20260815000001) — internal
-- only, no GRANT to authenticated. club_role() already requires an ACTIVE
-- club_members row and is completely orthogonal to clubs.archived_at, so
-- an archived club's still-active OWNER/ADMIN resolve here exactly like an
-- active club's — read access to historical statistics is never blocked
-- by archival, matching the Club Archival Principles' "read-only access
-- preserved" rule. SUPERADMIN gets no special path here (it never holds a
-- club_members row at all, so club_role() is always NULL for it) — no new
-- capability, as required.
CREATE OR REPLACE FUNCTION public._require_club_admin(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.club_role(p_club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to view statistics for this club' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._require_club_admin(uuid) FROM PUBLIC;


-- ─── Private helper: the one summary aggregate, reused for current AND
-- the previous comparison period ───────────────────────────────────────────
-- type != 'block' scopes every field; reservedMinutes additionally requires
-- status = 'confirmed' (a pending/cancelled/rejected reservation reserved no
-- court time). Deliberately returns only the raw counts a caller can layer
-- derived fields (rates, hours, averages) on top of — those depend on the
-- period length, which this helper doesn't know about.
CREATE OR REPLACE FUNCTION public._club_stats_summary(p_club_id uuid, p_start date, p_end date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalReservations', count(*),
    'confirmed', count(*) FILTER (WHERE r.status = 'confirmed'),
    'pending', count(*) FILTER (WHERE r.status = 'pending'),
    'cancelledOrRejected', count(*) FILTER (WHERE r.status IN ('cancelled', 'rejected')),
    'reservedMinutes', COALESCE(sum(r.duration_minutes) FILTER (WHERE r.status = 'confirmed'), 0)
  )
  FROM public.reservations r
  WHERE r.club_id = p_club_id
    AND r.date BETWEEN p_start AND p_end
    AND r.type != 'block';
$$;

REVOKE ALL ON FUNCTION public._club_stats_summary(uuid, date, date) FROM PUBLIC;


-- ─── get_club_statistics — the public entry point ──────────────────────────
-- Read-only: no INSERT/UPDATE/DELETE anywhere in this function. Dates are
-- taken as plain `date` values already resolved by the caller against
-- America/Bogota (reservations.date is itself a plain local calendar date —
-- it never needs a timezone conversion; only an instant-vs-now comparison
-- would, and this function never compares against now()). p_start_date/
-- p_end_date are inclusive on both ends (BETWEEN), so the caller's period
-- boundaries land exactly, with no off-by-one.
--
-- previousSummary covers the immediately preceding window of the EXACT
-- SAME number of days (v_prev_end = p_start_date - 1, v_prev_start =
-- v_prev_end - (v_days - 1)) — the one rule every period in this phase
-- must satisfy for a fair comparison, regardless of which of the 5 presets
-- produced [p_start_date, p_end_date].
--
-- Timeline bucketing: daily for any range up to 31 days (covers 7/30-day,
-- "this month", "last month" — all ≤31 days), weekly (Monday-start, via
-- date_trunc('week', ...)) for anything longer (the 90-day preset) — the
-- one case this phase allows weekly grouping "si mejora claramente la
-- legibilidad". Both branches zero-fill every bucket in range via
-- generate_series, so the returned series never has a silent gap.
CREATE OR REPLACE FUNCTION public.get_club_statistics(
  p_club_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_days             int;
  v_prev_start       date;
  v_prev_end         date;
  v_bucket           text;
  v_summary_raw      jsonb;
  v_previous_summary jsonb;
  v_type_counts      jsonb;
  v_summary          jsonb;
  v_timeline         jsonb;
  v_statuses         jsonb;
  v_courts           jsonb;
  v_weekdays         jsonb;
  v_hourly           jsonb;
  v_total_nonblock   int;
  v_confirmed        int;
BEGIN
  PERFORM public._require_club_admin(p_club_id);

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = 'P0003';
  END IF;

  v_days       := (p_end_date - p_start_date) + 1;
  v_prev_end   := p_start_date - 1;
  v_prev_start := v_prev_end - (v_days - 1);
  v_bucket     := CASE WHEN v_days > 31 THEN 'week' ELSE 'day' END;

  -- ─── Summary (current + previous, same helper) ──────────────────────────
  v_summary_raw      := public._club_stats_summary(p_club_id, p_start_date, p_end_date);
  v_previous_summary := public._club_stats_summary(p_club_id, v_prev_start, v_prev_end);

  v_total_nonblock := (v_summary_raw->>'totalReservations')::int;
  v_confirmed      := (v_summary_raw->>'confirmed')::int;

  -- Simple match/class split, layered onto summary — not a separate section
  -- (per scope: "sin convertirla en una sección adicional compleja").
  SELECT jsonb_build_object(
    'match', count(*) FILTER (WHERE r.type = 'match'),
    'class', count(*) FILTER (WHERE r.type = 'class')
  ) INTO v_type_counts
  FROM public.reservations r
  WHERE r.club_id = p_club_id AND r.date BETWEEN p_start_date AND p_end_date AND r.type != 'block';

  v_summary := v_summary_raw || jsonb_build_object(
    'matchReservations', COALESCE((v_type_counts->>'match')::int, 0),
    'classReservations', COALESCE((v_type_counts->>'class')::int, 0),
    'reservedHours',   round(((v_summary_raw->>'reservedMinutes')::numeric) / 60.0, 1),
    'dailyAverage',    round(v_total_nonblock::numeric / v_days, 1),
    'confirmationRate', CASE WHEN v_total_nonblock = 0 THEN 0
                              ELSE round((v_confirmed::numeric / v_total_nonblock) * 100, 1) END
  );

  -- ─── Evolución de reservas (timeline) — reservations.date, never created_at
  -- d/ws below are `timestamp` (generate_series over timestamp bounds), so
  -- a bare `::text` would serialize as "2026-08-01 00:00:00", not
  -- "2026-08-01" — cast to `date` FIRST, then `::text`, so the JSON always
  -- carries a plain YYYY-MM-DD the client's `new Date(iso + "T00:00:00")`
  -- can parse unambiguously.
  IF v_bucket = 'day' THEN
    SELECT jsonb_agg(jsonb_build_object('date', d::date::text, 'count', COALESCE(c.cnt, 0)) ORDER BY d)
    INTO v_timeline
    FROM generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') AS d
    LEFT JOIN (
      SELECT r.date, count(*) AS cnt
      FROM public.reservations r
      WHERE r.club_id = p_club_id AND r.date BETWEEN p_start_date AND p_end_date AND r.type != 'block'
      GROUP BY r.date
    ) c ON c.date = d::date;
  ELSE
    SELECT jsonb_agg(jsonb_build_object('date', ws::date::text, 'count', COALESCE(c.cnt, 0)) ORDER BY ws)
    INTO v_timeline
    FROM generate_series(
      date_trunc('week', p_start_date::timestamp),
      date_trunc('week', p_end_date::timestamp),
      interval '7 days'
    ) AS ws
    LEFT JOIN (
      SELECT date_trunc('week', r.date::timestamp)::date AS wk, count(*) AS cnt
      FROM public.reservations r
      WHERE r.club_id = p_club_id AND r.date BETWEEN p_start_date AND p_end_date AND r.type != 'block'
      GROUP BY 1
    ) c ON c.wk = ws::date;
  END IF;

  -- ─── Distribución por estado — confirmed/pending/cancelled/rejected kept
  -- separate (never merged, unlike the single "cancelledOrRejected" KPI) ──
  WITH counts AS (
    SELECT r.status, count(*) AS cnt
    FROM public.reservations r
    WHERE r.club_id = p_club_id AND r.date BETWEEN p_start_date AND p_end_date AND r.type != 'block'
    GROUP BY r.status
  ),
  labels(status, label, sort_order) AS (
    VALUES ('confirmed', 'Confirmadas', 1), ('pending', 'Pendientes', 2),
           ('cancelled', 'Canceladas', 3), ('rejected', 'Rechazadas', 4)
  )
  SELECT jsonb_agg(
    jsonb_build_object('status', l.status, 'label', l.label, 'count', COALESCE(c.cnt, 0))
    ORDER BY l.sort_order
  )
  INTO v_statuses
  FROM labels l LEFT JOIN counts c ON c.status = l.status;

  -- ─── Uso por cancha — confirmed, non-block only; includes courts that are
  -- currently inactive but had activity in range (no is_active filter) ────
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id, 'name', t.name,
      'reservationCount', t.reservation_count,
      'reservedMinutes', t.reserved_minutes
    )
    ORDER BY t.reserved_minutes DESC, t.reservation_count DESC, t.name ASC
  )
  INTO v_courts
  FROM (
    SELECT co.id, co.name, count(*) AS reservation_count, sum(r.duration_minutes) AS reserved_minutes
    FROM public.reservations r
    JOIN public.courts co ON co.id = r.court_id
    WHERE r.club_id = p_club_id
      AND r.date BETWEEN p_start_date AND p_end_date
      AND r.type != 'block'
      AND r.status = 'confirmed'
    GROUP BY co.id, co.name
  ) t;

  -- ─── Actividad por día de la semana — confirmed, non-block; fixed
  -- Monday..Sunday order (ISODOW), zero-filled ─────────────────────────────
  WITH counts AS (
    SELECT EXTRACT(ISODOW FROM r.date)::int AS dow, count(*) AS cnt, sum(r.duration_minutes) AS mins
    FROM public.reservations r
    WHERE r.club_id = p_club_id AND r.date BETWEEN p_start_date AND p_end_date
      AND r.type != 'block' AND r.status = 'confirmed'
    GROUP BY 1
  ),
  labels(dow, label) AS (
    VALUES (1, 'Lunes'), (2, 'Martes'), (3, 'Miércoles'), (4, 'Jueves'),
           (5, 'Viernes'), (6, 'Sábado'), (7, 'Domingo')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'weekday', l.dow, 'label', l.label,
      'count', COALESCE(c.cnt, 0), 'reservedMinutes', COALESCE(c.mins, 0)
    )
    ORDER BY l.dow
  )
  INTO v_weekdays
  FROM labels l LEFT JOIN counts c ON c.dow = l.dow;

  -- ─── Actividad por franja horaria — confirmed, non-block; start_time
  -- floored to the hour (18:30 → 18:00 bucket); only the observed min..max
  -- hour range is shown (zero-filled WITHIN that range), never all 24h ────
  WITH hourly AS (
    SELECT EXTRACT(HOUR FROM r.start_time)::int AS hr, count(*) AS cnt
    FROM public.reservations r
    WHERE r.club_id = p_club_id AND r.date BETWEEN p_start_date AND p_end_date
      AND r.type != 'block' AND r.status = 'confirmed'
    GROUP BY 1
  ),
  bounds AS (SELECT min(hr) AS lo, max(hr) AS hi FROM hourly),
  hours AS (
    SELECT generate_series(lo, hi) AS hr FROM bounds WHERE lo IS NOT NULL
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('hour', h.hr, 'label', lpad(h.hr::text, 2, '0') || ':00', 'count', COALESCE(ho.cnt, 0))
      ORDER BY h.hr
    ),
    '[]'::jsonb
  )
  INTO v_hourly
  FROM hours h LEFT JOIN hourly ho ON ho.hr = h.hr;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', p_start_date::text, 'end', p_end_date::text, 'days', v_days),
    'timelineGranularity', v_bucket,
    'summary', v_summary,
    'previousSummary', v_previous_summary,
    'timeline', COALESCE(v_timeline, '[]'::jsonb),
    'statuses', COALESCE(v_statuses, '[]'::jsonb),
    'courts', COALESCE(v_courts, '[]'::jsonb),
    'weekdays', COALESCE(v_weekdays, '[]'::jsonb),
    'hourlySlots', v_hourly
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_statistics(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_statistics(uuid, date, date) TO authenticated;
