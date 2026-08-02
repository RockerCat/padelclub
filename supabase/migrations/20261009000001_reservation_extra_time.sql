-- ============================================================
-- Reservation extra time ("Agregar tiempo extra")
-- Mi Pádel Club
-- ============================================================
-- Lets OWNER/ADMIN extend a CONFIRMED reservation's end time by an open
-- number of minutes (never limited to the club's catalog durations), with
-- an optional extra charge. Model decision, made after auditing the
-- existing reservation/pricing schema:
--
--   duration_minutes becomes the reservation's CURRENT total occupancy
--   length (original + every extra minute ever added). This is
--   deliberate, not incidental: every existing conflict check
--   (_check_reservation_conflict), every calendar block height
--   (WeekCalendar/AdminAvailabilityView), and every end-time label
--   (ReservationTicketPanel, PendingRequestsSection, RejectedReservations-
--   Section, the dashboard) already computes "end = start_time +
--   duration_minutes" directly off this one column — bumping it in place
--   is what makes "el calendario queda ocupado" and "impedir nuevas
--   reservas dentro del tiempo extendido" true everywhere for free, with
--   zero changes to any of those call sites (the one shared source of
--   truth CLAUDE.md already requires). The alternative (a separate
--   "effective duration" computed ad hoc by every caller) would have
--   meant patching every one of those places and risking exactly the kind
--   of drift the existing helpers were built to prevent.
--
--   price_amount/price_currency (the ORIGINAL resolved price) are never
--   touched by this feature — that IS "valor original conservado", for
--   free, just by not writing to those columns. The extra charge
--   accumulates separately in extra_amount/extra_currency. Total =
--   COALESCE(price_amount,0) + extra_amount, computed by the caller, never
--   stored (nothing to keep in sync).
--
--   extra_minutes accumulates independently of duration_minutes so "cuántos
--   minutos extra tiene esta reserva" stays answerable without having to
--   know the original duration — both together, plus duration_minutes
--   itself (now = original + extra_minutes), give the three numbers the
--   spec asks the UI to keep showing (duración original is recoverable as
--   duration_minutes - extra_minutes, but is never stored redundantly).
--
-- No general "billing" module and no separate reservation-adjustments
-- table already existed (audited: only club_player_point_movements is a
-- comparable append-only ledger, for an unrelated domain) — so this
-- migration creates exactly one new, minimal, append-only table
-- (reservation_extra_time_entries) for the audit trail the spec asks for
-- ("usuario, fecha, minutos, valor, nota"), mirroring that table's own
-- shape/RLS convention: closed to every client role, written only by the
-- SECURITY DEFINER RPC below. This also naturally supports "más de una
-- extensión sobre la misma reserva" — each call inserts one more row and
-- bumps the two running totals atomically in the same transaction.
-- ============================================================


-- ─── 1. Relax the duration CHECK ────────────────────────────────────────────
-- Previously IN (30, 60, 90, 120) — a reservation's *current* occupancy
-- length is no longer limited to that catalog once extensions exist (e.g.
-- 60 + 25 = 85). The catalog restriction still fully applies at creation
-- time and to the general edit flow (ReservationForm's duration <select>
-- only ever offers the club's configured durations) — this only widens
-- what an EXISTING row's duration_minutes is allowed to hold.
ALTER TABLE public.reservations
  DROP CONSTRAINT reservations_valid_duration;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_valid_duration
  CHECK (duration_minutes > 0);


-- ─── 2. Accumulator columns ──────────────────────────────────────────────────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS extra_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_currency text;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_extra_minutes_non_negative CHECK (extra_minutes >= 0),
  ADD CONSTRAINT reservations_extra_amount_non_negative  CHECK (extra_amount >= 0);


-- ─── 3. Audit ledger — one row per "Agregar tiempo extra" call ──────────────
CREATE TABLE public.reservation_extra_time_entries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  -- Denormalized for indexing/RLS symmetry with every other club-scoped
  -- table — never a second source of truth, always written from the same
  -- reservation row's own club_id inside the RPC below.
  club_id        uuid        NOT NULL REFERENCES public.clubs(id),
  added_by       uuid        NOT NULL REFERENCES public.profiles(id),
  added_minutes  integer     NOT NULL CHECK (added_minutes > 0),
  added_amount   numeric(10,2) NOT NULL DEFAULT 0 CHECK (added_amount >= 0),
  currency       text        NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reservation_extra_time_entries_reservation_idx
  ON public.reservation_extra_time_entries(reservation_id, created_at);
CREATE INDEX reservation_extra_time_entries_club_idx
  ON public.reservation_extra_time_entries(club_id);

-- RLS-closed to every client role — same convention as
-- club_player_point_movements/club_member_sport_state (see CLAUDE.md, Sport
-- / Ranking Module Principles). The only write path is the SECURITY
-- DEFINER RPC below; there is no client-facing read requirement yet (the
-- spec only asks the aggregate totals, already on `reservations` itself
-- and already readable under its existing RLS, to show in the UI).
ALTER TABLE public.reservation_extra_time_entries ENABLE ROW LEVEL SECURITY;


-- ─── 4. add_reservation_extra_time ───────────────────────────────────────────
-- Atomic: validate → take the exact same shared court+date advisory lock
-- every create/edit/approve path already uses (_lock_court_date) → re-check
-- under the lock → conflict-check with the SAME shared helper
-- (_check_reservation_conflict) creation/edit already use, confirmed-only,
-- excluding this reservation's own row → extend duration_minutes, bump the
-- two accumulators → insert one audit row. Two concurrent extensions (or an
-- extension racing a new reservation) on the same court+day always
-- serialize through that one lock, exactly like every other write in this
-- module.
CREATE OR REPLACE FUNCTION public.add_reservation_extra_time(
  p_reservation_id uuid,
  p_extra_minutes  integer,
  p_extra_amount   numeric,
  p_note           text
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation   public.reservations;
  v_role          text;
  v_new_duration  integer;
  v_day_of_week   int;
  v_is_open       boolean;
  v_opens_at      time;
  v_closes_at     time;
  v_start_min     int;
  v_new_end_min   int;
  v_close_min     int;
  v_has_conflict  boolean;
  v_currency      text;
  v_note          text;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- "número entero mayor que 0" / "cualquier cantidad razonable" — no
  -- product rule caps this beyond a generous 8-hour defensive ceiling
  -- against garbage input; nothing in the spec asks for a stricter one.
  IF p_extra_minutes IS NULL OR p_extra_minutes <= 0 OR p_extra_minutes > 480 THEN
    RAISE EXCEPTION 'Extra minutes must be between 1 and 480' USING ERRCODE = '22023';
  END IF;

  IF p_extra_amount IS NULL OR p_extra_amount < 0 THEN
    RAISE EXCEPTION 'Extra amount cannot be negative' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  -- effective_club_role already scopes to THIS reservation's club, requires
  -- an ACTIVE real membership, or falls back to SUPERADMIN elevated access
  -- (resolved as 'OWNER') — same helper create_reservation_admin/
  -- update_reservation/approve_pending_reservation already use.
  v_role := public.effective_club_role(v_reservation.club_id);
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to extend this reservation' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_reservation.club_id);

  -- Only a confirmed reservation can be extended — never pending (nothing
  -- to extend yet), never cancelled/rejected (already ended).
  IF v_reservation.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed reservation can be extended' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts
    WHERE id = v_reservation.court_id AND club_id = v_reservation.club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  -- ─── Operating-hours boundary — closing time only ─────────────────────────
  -- Deliberately NOT _check_operating_hours: that helper also rejects any
  -- duration outside the club's configured catalog ({60,90,120}), which
  -- extra time is explicitly exempt from ("no limitarlo a 30, 60, 90 o
  -- 120"). The reservation's start already passed every hours check when
  -- it was created/last edited and never moves here — only the new END
  -- needs re-validating against the club's closing time for this day.
  -- Same is_open/opens_at/closes_at lookup + DEFAULT_OPERATING_HOURS
  -- fallback as _check_operating_hours, kept in sync by hand since CHECK
  -- constraints/functions can't share a body across two different rule
  -- shapes.
  v_day_of_week := EXTRACT(DOW FROM v_reservation.date)::int;
  SELECT is_open, opens_at, closes_at INTO v_is_open, v_opens_at, v_closes_at
  FROM public.club_operating_hours
  WHERE club_id = v_reservation.club_id AND day_of_week = v_day_of_week;

  IF NOT FOUND THEN
    IF v_day_of_week = 0 THEN
      v_is_open := false; v_opens_at := NULL; v_closes_at := NULL;
    ELSIF v_day_of_week BETWEEN 1 AND 5 THEN
      v_is_open := true; v_opens_at := '06:00'; v_closes_at := '22:00';
    ELSE
      v_is_open := true; v_opens_at := '08:00'; v_closes_at := '18:00';
    END IF;
  END IF;

  IF NOT v_is_open THEN
    RAISE EXCEPTION 'El club está cerrado este día.' USING ERRCODE = 'P0003';
  END IF;

  -- Same shared lock every create/edit/approve path takes for this exact
  -- court+day — see 20260814000001's header comment for the deadlock-
  -- freedom argument (at most one lock per transaction here too).
  PERFORM public._lock_court_date(v_reservation.court_id, v_reservation.date);

  -- Re-read AFTER acquiring the lock: another admin could have extended
  -- (or cancelled) this exact reservation while this call was waiting for
  -- a lock held by an unrelated create/edit for the same court+day — the
  -- same "re-check under the lock" pattern approve_pending_reservation
  -- already uses. Recomputes v_new_duration off the freshest
  -- duration_minutes so two successive extensions always accumulate
  -- correctly instead of one silently clobbering the other, and so the
  -- closing-hours boundary below is checked against the true post-lock
  -- total, not a value that could already be stale by the time the lock
  -- was granted.
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF v_reservation.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed reservation can be extended' USING ERRCODE = '22023';
  END IF;
  v_new_duration := v_reservation.duration_minutes + p_extra_minutes;

  IF v_opens_at IS NOT NULL AND v_closes_at IS NOT NULL THEN
    v_start_min := EXTRACT(HOUR FROM v_reservation.start_time)::int * 60 + EXTRACT(MINUTE FROM v_reservation.start_time)::int;
    v_new_end_min := v_start_min + v_new_duration;
    v_close_min := EXTRACT(HOUR FROM v_closes_at)::int * 60 + EXTRACT(MINUTE FROM v_closes_at)::int;

    IF v_new_end_min > v_close_min THEN
      RAISE EXCEPTION 'La extensión termina después del horario de cierre (%).', to_char(v_closes_at, 'HH24:MI')
        USING ERRCODE = 'P0003';
    END IF;
  END IF;

  -- Confirmed-only, excluding this reservation's own row — identical
  -- semantics/helper every other create/edit/approve path already shares.
  v_has_conflict := public._check_reservation_conflict(
    v_reservation.court_id, v_reservation.date, v_reservation.start_time, v_new_duration,
    p_reservation_id, ARRAY['confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  -- Currency for the extra charge: whatever currency this reservation is
  -- already extending in (a prior extension), else the reservation's own
  -- original price_currency, else the codebase-wide 'COP' default already
  -- used everywhere else a currency needs a fallback
  -- (upsert_pricing_rule_with_prices).
  v_currency := COALESCE(v_reservation.extra_currency, v_reservation.price_currency, 'COP');
  v_note := NULLIF(btrim(left(COALESCE(p_note, ''), 500)), '');

  UPDATE public.reservations
  SET duration_minutes = v_new_duration,
      extra_minutes    = v_reservation.extra_minutes + p_extra_minutes,
      extra_amount     = v_reservation.extra_amount + p_extra_amount,
      extra_currency   = v_currency
  WHERE id = p_reservation_id AND status = 'confirmed'
  RETURNING * INTO v_reservation;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation was modified concurrently' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reservation_extra_time_entries (
    reservation_id, club_id, added_by, added_minutes, added_amount, currency, note
  ) VALUES (
    p_reservation_id, v_reservation.club_id, auth.uid(), p_extra_minutes, p_extra_amount, v_currency, v_note
  );

  RETURN v_reservation;
END;
$$;

REVOKE ALL ON FUNCTION public.add_reservation_extra_time(uuid, integer, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_reservation_extra_time(uuid, integer, numeric, text) TO authenticated;


-- ─── 5. notify_reservation_extra_time_added ──────────────────────────────────
-- Best-effort, called separately by the caller right after
-- add_reservation_extra_time succeeds — same convention as
-- notify_reservation_updated (never rolled back over a notification-only
-- failure). Notifies the creator + every linked participant, same fan-out
-- shape as notify_reservation_updated's OWNER/ADMIN-edited branch (an
-- extension is always an OWNER/ADMIN action, never a PLAYER one, so there
-- is only ever this one branch — unlike notify_reservation_updated, which
-- also handles a PLAYER-initiated edit).
CREATE OR REPLACE FUNCTION public.notify_reservation_extra_time_added(
  p_reservation_id uuid,
  p_extra_minutes  integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation public.reservations;
  v_club_slug   text;
  v_court_name  text;
  v_date_label  text;
  v_time_range  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;
  SELECT name INTO v_court_name FROM public.courts WHERE id = v_reservation.court_id;

  v_date_label := CASE
    WHEN v_reservation.date = current_date THEN 'hoy'
    WHEN v_reservation.date = current_date + 1 THEN 'mañana'
    ELSE to_char(v_reservation.date, 'DD/MM')
  END;
  v_time_range := to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
    to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI');

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT DISTINCT
    affected.profile_id,
    v_reservation.club_id,
    'reservation_updated',
    'Se agregó tiempo extra a tu reserva',
    'El club agregó ' || p_extra_minutes || ' minutos a tu reserva en ' ||
      COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || '. Nuevo horario: ' || v_time_range || '.',
    jsonb_build_object(
      'club_id', v_reservation.club_id,
      'club_slug', v_club_slug,
      'reservation_id', p_reservation_id,
      'destination', '/' || v_club_slug || '/reservations?reservationId=' || p_reservation_id
    )
  FROM (
    SELECT v_reservation.created_by AS profile_id
    UNION
    SELECT profile_id FROM public.reservation_players WHERE reservation_id = p_reservation_id
  ) affected
  WHERE affected.profile_id <> auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reservation_extra_time_added(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_reservation_extra_time_added(uuid, integer) TO authenticated;
