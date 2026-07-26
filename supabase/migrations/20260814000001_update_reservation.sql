-- ============================================================
-- Reservation availability concurrency + edit — Phase 7 (corrected)
-- Mi Pádel Club
-- ============================================================
-- Audit finding that drove this rewrite: the first version of this
-- migration only took an advisory lock inside update_reservation. That
-- protects edit-vs-edit, but requestReservation (PLAYER create,
-- reservations/actions.ts) and createReservation (OWNER/ADMIN create,
-- admin/reservations/actions.ts) each still did their own
-- SELECT-overlap-then-INSERT directly from a Server Action — no lock, no
-- shared transaction with update_reservation's guard. A reservation could
-- still be created in the exact window between update_reservation's
-- conflict check and its UPDATE (or between either create path's own
-- check and its own INSERT), because Supabase executes every separate
-- `supabase.rpc(...)`/`.from(...).insert(...)` call in its OWN
-- transaction — a lock taken and released inside one call cannot protect
-- a check made in a different call. The only way an advisory lock
-- actually protects a "check availability, then write" sequence is if the
-- check and the write happen inside the SAME function call (the same
-- transaction) — exactly why update_reservation's own check+UPDATE
-- already worked correctly, and exactly why requestReservation/
-- createReservation's separate check+insert never did.
--
-- Fix: both create paths now also go through a SECURITY DEFINER RPC that
-- takes the identical advisory lock, re-validates the identical rules,
-- and inserts — all inside one transaction, exactly like
-- update_reservation. All three entry points (create_reservation_player,
-- create_reservation_admin, update_reservation) share the same private
-- helpers below, so there is exactly one implementation each of "take the
-- availability lock", "check for a conflicting reservation", "validate
-- operating hours", and "resolve the price" — never a second, drifting
-- copy per caller.
--
-- Lock key: hashtext(court_id || date) — the exact same key every caller
-- uses for the exact same (court, day), so two calls targeting the same
-- court/day always serialize against each other regardless of which of
-- the three entry points they came through. Deliberately coarse
-- (per court+day, not per exact time range): correctness over
-- micro-concurrency, consistent with the task's explicit preference for
-- provable protection over cleverness.
--
-- Editing across court A→B or date A→B: only the DESTINATION (the new
-- court_id/date being requested) is ever locked, never the source.  This
-- is sufficient and deadlock-free by construction: the reservation being
-- edited already uniquely identifies which row can move OUT of its old
-- slot (this transaction's own UPDATE), so nothing else needs to be kept
-- from claiming the OLD slot while we hold anything — a concurrent write
-- targeting the old slot only ever needs (and takes) a lock on the OLD
-- slot itself, not on ours. Since every function in this file acquires at
-- most ONE advisory lock per call, no transaction can ever hold one lock
-- while waiting on another — a wait-for cycle (the precondition for a
-- deadlock) is structurally impossible here, so no deterministic lock
-- ordering is needed.
-- ============================================================

-- ─── Private helper: take the shared availability lock ─────────────────────
CREATE OR REPLACE FUNCTION public._lock_court_date(p_court_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_court_id::text || p_date::text));
END;
$$;

REVOKE ALL ON FUNCTION public._lock_court_date(uuid, date) FROM PUBLIC;


-- ─── Private helper: operating-hours + duration validation ──────────────────
-- Mirrors validateAgainstOperatingHours (src/lib/operatingHours.ts) +
-- getClubDurations (src/lib/durations.ts) exactly, including the same
-- DEFAULT_OPERATING_HOURS fallback and the same "fall back to {60,90,120}
-- if the club's own array is empty/invalid" defensive behavior (the
-- clubs_valid_durations CHECK constraint already guarantees this can't
-- really happen, kept here only for parity). Returns an error message, or
-- NULL when the slot is valid.
CREATE OR REPLACE FUNCTION public._check_operating_hours(
  p_club_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_allowed_durations integer[];
  v_day_of_week       int;
  v_is_open           boolean;
  v_opens_at          time;
  v_closes_at         time;
  v_start_min         int;
  v_end_min           int;
  v_open_min          int;
  v_close_min         int;
BEGIN
  SELECT allowed_reservation_durations INTO v_allowed_durations
  FROM public.clubs WHERE id = p_club_id;
  IF v_allowed_durations IS NULL OR array_length(v_allowed_durations, 1) IS NULL THEN
    v_allowed_durations := ARRAY[60, 90, 120];
  END IF;
  IF NOT (p_duration_minutes = ANY(v_allowed_durations)) THEN
    RETURN 'Esta duración no está permitida para este club.';
  END IF;

  v_day_of_week := EXTRACT(DOW FROM p_date)::int; -- 0=Sunday, matches JS getDay()
  SELECT is_open, opens_at, closes_at INTO v_is_open, v_opens_at, v_closes_at
  FROM public.club_operating_hours
  WHERE club_id = p_club_id AND day_of_week = v_day_of_week;

  IF NOT FOUND THEN
    -- Same DEFAULT_OPERATING_HOURS fallback as operatingHours.ts: closed
    -- Sunday, 06:00-22:00 Mon-Fri, 08:00-18:00 Saturday.
    IF v_day_of_week = 0 THEN
      v_is_open := false; v_opens_at := NULL; v_closes_at := NULL;
    ELSIF v_day_of_week BETWEEN 1 AND 5 THEN
      v_is_open := true; v_opens_at := '06:00'; v_closes_at := '22:00';
    ELSE
      v_is_open := true; v_opens_at := '08:00'; v_closes_at := '18:00';
    END IF;
  END IF;

  IF NOT v_is_open THEN
    RETURN 'El club está cerrado este día.';
  END IF;

  IF v_opens_at IS NOT NULL AND v_closes_at IS NOT NULL THEN
    v_start_min := EXTRACT(HOUR FROM p_start_time)::int * 60 + EXTRACT(MINUTE FROM p_start_time)::int;
    v_end_min := v_start_min + p_duration_minutes;
    v_open_min := EXTRACT(HOUR FROM v_opens_at)::int * 60 + EXTRACT(MINUTE FROM v_opens_at)::int;
    v_close_min := EXTRACT(HOUR FROM v_closes_at)::int * 60 + EXTRACT(MINUTE FROM v_closes_at)::int;

    IF v_start_min < v_open_min THEN
      RETURN 'La reserva no puede empezar antes de las ' || to_char(v_opens_at, 'HH24:MI') || '.';
    END IF;
    IF v_end_min > v_close_min THEN
      RETURN 'La reserva no puede terminar después de las ' || to_char(v_closes_at, 'HH24:MI') || '.';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._check_operating_hours(uuid, date, time, integer) FROM PUBLIC;


-- ─── Private helper: conflict check ──────────────────────────────────────────
-- Same overlap arithmetic every caller already used (start < otherEnd AND
-- end > otherStart), parameterized by which statuses count as "occupying"
-- — PLAYER creation already blocked against pending+confirmed
-- (requestReservation); OWNER/ADMIN creation and edit only ever blocked
-- against confirmed (checkOverlap) — both preserved exactly, not unified
-- into one new rule. No `type` filter, matching the existing behavior
-- that a block occupies the slot the same as a match/class.
-- p_exclude_id lets update_reservation exclude its own row; NULL for the
-- create paths, which have no "own row" yet.
CREATE OR REPLACE FUNCTION public._check_reservation_conflict(
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_exclude_id uuid,
  p_statuses text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_start_min int;
  v_end_min   int;
  v_conflict  boolean;
BEGIN
  v_start_min := EXTRACT(HOUR FROM p_start_time)::int * 60 + EXTRACT(MINUTE FROM p_start_time)::int;
  v_end_min := v_start_min + p_duration_minutes;

  SELECT EXISTS (
    SELECT 1 FROM public.reservations r2
    WHERE r2.court_id = p_court_id
      AND r2.date = p_date
      AND (p_exclude_id IS NULL OR r2.id <> p_exclude_id)
      AND r2.status = ANY(p_statuses)
      AND v_start_min < (EXTRACT(HOUR FROM r2.start_time)::int * 60 + EXTRACT(MINUTE FROM r2.start_time)::int + r2.duration_minutes)
      AND v_end_min > (EXTRACT(HOUR FROM r2.start_time)::int * 60 + EXTRACT(MINUTE FROM r2.start_time)::int)
  ) INTO v_conflict;

  RETURN v_conflict;
END;
$$;

REVOKE ALL ON FUNCTION public._check_reservation_conflict(uuid, date, time, integer, uuid, text[]) FROM PUBLIC;


-- ─── Private helper: pricing — the ONE source of truth ──────────────────────
-- Mirrors selectApplicablePricingRule + the duration price lookup from
-- src/lib/reservationPricing.ts (court-specific rule wins over a general
-- one for the same club/day/time; no match, or no configured price for
-- the exact duration, both come back as "not matched" rather than an
-- error). Called by create_reservation_player and update_reservation's
-- PLAYER branch — the only two places a reservation is ever priced,
-- exactly like requestReservation was the only TypeScript caller of
-- resolveReservationPrice. There is no second, TypeScript-side pricing
-- calculation anywhere in the write path anymore — getReservationPriceQuote
-- (the pre-submit preview shown in the UI) still calls the TypeScript
-- resolveReservationPrice directly, which is fine: it is read-only, never
-- reserves anything, and is never trusted for the actual write (the RPC
-- always recomputes for itself).
CREATE OR REPLACE FUNCTION public._resolve_reservation_price(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  OUT o_matched boolean,
  OUT o_pricing_rule_id uuid,
  OUT o_price_amount numeric,
  OUT o_price_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_day_of_week int;
  v_rule_id     uuid;
BEGIN
  o_matched := false;
  v_day_of_week := EXTRACT(DOW FROM p_date)::int; -- 0=Sunday, matches JS getDay()

  SELECT id INTO v_rule_id
  FROM public.club_pricing_rules
  WHERE club_id = p_club_id
    AND is_active = true
    AND court_id = p_court_id
    AND v_day_of_week = ANY(days_of_week)
    AND p_start_time >= start_time
    AND p_start_time < (CASE WHEN end_time = '00:00:00'::time THEN '24:00:00'::time ELSE end_time END)
  LIMIT 1;

  IF v_rule_id IS NULL THEN
    SELECT id INTO v_rule_id
    FROM public.club_pricing_rules
    WHERE club_id = p_club_id
      AND is_active = true
      AND court_id IS NULL
      AND v_day_of_week = ANY(days_of_week)
      AND p_start_time >= start_time
      AND p_start_time < (CASE WHEN end_time = '00:00:00'::time THEN '24:00:00'::time ELSE end_time END)
    LIMIT 1;
  END IF;

  IF v_rule_id IS NULL THEN
    RETURN;
  END IF;

  SELECT price_amount, currency INTO o_price_amount, o_price_currency
  FROM public.club_pricing_rule_prices
  WHERE pricing_rule_id = v_rule_id AND duration_minutes = p_duration_minutes;

  IF o_price_amount IS NULL THEN
    RETURN;
  END IF;

  o_matched := true;
  o_pricing_rule_id := v_rule_id;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_reservation_price(uuid, uuid, date, time, integer) FROM PUBLIC;
-- None of the four helpers above are granted to authenticated — internal
-- only, callable exclusively from within another SECURITY DEFINER
-- function in this schema (its owner already has implicit execute rights
-- on them).


-- ─── create_reservation_player ───────────────────────────────────────────────
-- Replaces requestReservation's own inline validate-then-insert
-- (reservations/actions.ts) with the same rules, now inside one locked
-- transaction. Preserves that function's exact existing behavior:
--   - any ACTIVE club member may call this (requestReservation never
--     required role = PLAYER specifically — only membership), preserved
--     as-is rather than tightened, since tightening it is outside this
--     phase's scope;
--   - conflict check blocks against pending AND confirmed (unlike the
--     admin create path, which only ever blocked against confirmed);
--   - type is always 'match', status is always 'pending' — unchanged;
--   - price is resolved and persisted, blocking the request with a clear
--     message when no tariff applies — unchanged.
-- notify_reservation_request_created is still called separately by the
-- caller after this succeeds, exactly as before — this RPC only creates
-- the row.
CREATE OR REPLACE FUNCTION public.create_reservation_player(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_hours_error   text;
  v_has_conflict  boolean;
  v_price         record;
  v_new_start_at  timestamptz;
  v_reservation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.club_role(p_club_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this club' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts WHERE id = p_court_id AND club_id = p_club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  v_new_start_at := (p_date + p_start_time) AT TIME ZONE 'America/Bogota';
  IF v_new_start_at <= now() THEN
    RAISE EXCEPTION 'Start time is in the past' USING ERRCODE = 'P0003';
  END IF;

  v_hours_error := public._check_operating_hours(p_club_id, p_date, p_start_time, p_duration_minutes);
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  PERFORM public._lock_court_date(p_court_id, p_date);

  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, NULL, ARRAY['pending', 'confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  SELECT * INTO v_price FROM public._resolve_reservation_price(
    p_club_id, p_court_id, p_date, p_start_time, p_duration_minutes
  );
  IF NOT v_price.o_matched THEN
    RAISE EXCEPTION 'No pricing rule configured for this time' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.reservations (
    club_id, court_id, created_by, date, start_time, duration_minutes, type, status,
    price_amount, price_currency, pricing_rule_id, price_calculated_at
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, 'match', 'pending',
    v_price.o_price_amount, v_price.o_price_currency, v_price.o_pricing_rule_id, now()
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer) TO authenticated;


-- ─── create_reservation_admin ────────────────────────────────────────────────
-- Replaces createReservation's own inline validate-then-insert
-- (admin/reservations/actions.ts) with the same rules, now inside one
-- locked transaction. Preserves that function's exact existing behavior:
--   - OWNER/ADMIN of this club only;
--   - conflict check blocks against confirmed only (never pending) —
--     unchanged from checkOverlap's existing behavior;
--   - type/title/notes as given (block requires a title, same as
--     validate() already enforced); status is always 'confirmed' (the
--     column's own default, made explicit here);
--   - price is never touched — admin-created reservations have never been
--     priced anywhere in this codebase, unchanged.
-- reservation_players + notify_reservation_created_for_players are still
-- handled by the caller after this succeeds, exactly as before — this RPC
-- only creates the reservation row itself.
CREATE OR REPLACE FUNCTION public.create_reservation_admin(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_type text,
  p_title text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_hours_error    text;
  v_has_conflict   boolean;
  v_new_start_at   timestamptz;
  v_reservation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.club_role(p_club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to create reservations for this club' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('match', 'class', 'block') THEN
    RAISE EXCEPTION 'Invalid reservation type' USING ERRCODE = 'P0003';
  END IF;
  IF p_type = 'block' AND (p_title IS NULL OR btrim(p_title) = '') THEN
    RAISE EXCEPTION 'Title is required for a block' USING ERRCODE = 'P0003';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts WHERE id = p_court_id AND club_id = p_club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  v_new_start_at := (p_date + p_start_time) AT TIME ZONE 'America/Bogota';
  IF v_new_start_at <= now() THEN
    RAISE EXCEPTION 'Start time is in the past' USING ERRCODE = 'P0003';
  END IF;

  v_hours_error := public._check_operating_hours(p_club_id, p_date, p_start_time, p_duration_minutes);
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  PERFORM public._lock_court_date(p_court_id, p_date);

  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, NULL, ARRAY['confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.reservations (
    club_id, court_id, created_by, date, start_time, duration_minutes, type, status, title, notes
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, p_type, 'confirmed', p_title, p_notes
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text) TO authenticated;


-- ─── update_reservation ─────────────────────────────────────────────────────
-- Same rules/order as before, now built on the shared
-- _lock_court_date/_check_operating_hours/_check_reservation_conflict/
-- _resolve_reservation_price helpers above instead of its own inline
-- copies — no behavior change from the previous version of this
-- (unapplied) migration, only de-duplication against the two create paths.
CREATE OR REPLACE FUNCTION public.update_reservation(
  p_reservation_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation      public.reservations;
  v_role             text;
  v_current_start_at timestamptz;
  v_new_start_at     timestamptz;
  v_hours_error      text;
  v_has_conflict     boolean;
  v_fields_changed   boolean;
  v_new_status       text;
  v_price            record;
  v_updated_count    int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Reservation is not in an editable state' USING ERRCODE = '22023';
  END IF;

  -- club_role() already scopes to THIS reservation's club and requires
  -- is_active = true.
  v_role := public.club_role(v_reservation.club_id);

  IF v_role IN ('OWNER', 'ADMIN') THEN
    NULL; -- operational edit, no 2-hour window
  ELSIF v_role = 'PLAYER' THEN
    IF v_reservation.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Only the creator can edit this reservation' USING ERRCODE = '42501';
    END IF;

    IF v_reservation.type = 'block' THEN
      RAISE EXCEPTION 'A PLAYER cannot edit a block reservation' USING ERRCODE = '42501';
    END IF;

    -- Same wall-clock instant convention as cancel_reservation
    -- (20260811000002): the CURRENT start time, not the requested new one
    -- — "inicio actual de la reserva - now() >= interval '2 hours'".
    v_current_start_at := (v_reservation.date + v_reservation.start_time) AT TIME ZONE 'America/Bogota';
    IF v_current_start_at - now() < interval '2 hours' THEN
      RAISE EXCEPTION 'Cannot edit within 2 hours of the reservation start time' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to edit this reservation' USING ERRCODE = '42501';
  END IF;

  -- ─── New values must satisfy every rule reservation creation already
  -- enforces ──────────────────────────────────────────────────────────────

  IF NOT EXISTS (
    SELECT 1 FROM public.courts
    WHERE id = p_court_id AND club_id = v_reservation.club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  v_new_start_at := (p_date + p_start_time) AT TIME ZONE 'America/Bogota';
  IF v_new_start_at <= now() THEN
    RAISE EXCEPTION 'New start time is in the past' USING ERRCODE = 'P0003';
  END IF;

  v_hours_error := public._check_operating_hours(v_reservation.club_id, p_date, p_start_time, p_duration_minutes);
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  -- Only the DESTINATION slot is locked — see the header comment for why
  -- this is sufficient even when court and/or date both change, and why
  -- it can never deadlock (at most one lock per transaction, always).
  PERFORM public._lock_court_date(p_court_id, p_date);

  -- PLAYER's own create flow blocks against both pending AND confirmed;
  -- the admin create/edit flow only ever blocked against confirmed — both
  -- existing behaviors preserved here rather than unified into one rule.
  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, p_reservation_id,
    CASE WHEN v_role = 'PLAYER' THEN ARRAY['pending','confirmed'] ELSE ARRAY['confirmed'] END
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  -- ─── Resulting status / price ──────────────────────────────────────────
  v_fields_changed := (
    p_court_id <> v_reservation.court_id
    OR p_date <> v_reservation.date
    OR p_start_time <> v_reservation.start_time
    OR p_duration_minutes <> v_reservation.duration_minutes
  );

  IF v_role IN ('OWNER', 'ADMIN') THEN
    -- Operational edit — status is never touched, exactly like the prior
    -- direct updateReservation.
    UPDATE public.reservations
    SET court_id = p_court_id, date = p_date, start_time = p_start_time, duration_minutes = p_duration_minutes
    WHERE id = p_reservation_id AND status = v_reservation.status;
  ELSE
    IF v_reservation.status = 'pending' OR NOT v_fields_changed THEN
      v_new_status := v_reservation.status;
    ELSE
      -- Was confirmed and the schedule actually changed — reuses the exact
      -- rule requestReservation already applies to every new request
      -- (there is no auto-approval policy anywhere in this codebase):
      -- needs fresh review.
      v_new_status := 'pending';
    END IF;

    SELECT * INTO v_price FROM public._resolve_reservation_price(
      v_reservation.club_id, p_court_id, p_date, p_start_time, p_duration_minutes
    );
    IF NOT v_price.o_matched THEN
      RAISE EXCEPTION 'No pricing rule configured for this time' USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.reservations
    SET court_id = p_court_id, date = p_date, start_time = p_start_time, duration_minutes = p_duration_minutes,
        status = v_new_status,
        price_amount = v_price.o_price_amount,
        price_currency = v_price.o_price_currency,
        pricing_rule_id = v_price.o_pricing_rule_id,
        price_calculated_at = now()
    WHERE id = p_reservation_id AND status = v_reservation.status;
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation was modified or resolved concurrently' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_reservation(uuid, uuid, date, time, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_reservation(uuid, uuid, date, time, integer) TO authenticated;


-- ─── approve_pending_reservation ─────────────────────────────────────────────
-- Closes the last gap in the shared availability protection: approving a
-- pending request also turns it into an occupied confirmed slot, exactly
-- like create_reservation_player/create_reservation_admin/
-- update_reservation do, but the previous approvePendingReservation
-- (admin/reservations/actions.ts) did its own SELECT-conflict-check then
-- UPDATE from a Server Action — two separate transactions, no lock, the
-- same class of race already fixed for creation/edit. This RPC takes the
-- identical _lock_court_date(court_id, date) lock and the identical
-- _check_reservation_conflict helper (confirmed-only, excluding this
-- reservation's own id — unchanged from the original checkOverlap-based
-- behavior), so an approval can never race a concurrent create/edit for
-- the same court+day into two overlapping confirmed reservations.
--
-- Every rule the original TypeScript implementation enforced is preserved
-- exactly: OWNER/ADMIN of this reservation's club only; only a 'pending'
-- reservation is approvable; the court must still be active; duration and
-- operating hours must still be valid (via the same shared
-- _check_operating_hours helper create/edit already use); status is
-- re-checked again immediately AFTER acquiring the lock (not just before
-- — another admin could have approved/rejected the very same request
-- while this call was waiting for the lock), and the final UPDATE is
-- still an atomic compare-and-swap on status = 'pending' with a
-- ROW_COUNT check, so a genuine double-click or two-admins-at-once race
-- still resolves to exactly one winner. Nothing about who can approve,
-- what counts as pending, participants, creator, price, or the
-- reject/pending↔confirmed policy changes — only the conflict-check +
-- write became atomic and shared with the rest of the availability
-- protection. resolve_reservation_request_notifications is still called
-- by the Server Action separately, in the same place, only after this
-- RPC succeeds — unchanged.
CREATE OR REPLACE FUNCTION public.approve_pending_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation   public.reservations;
  v_role          text;
  v_hours_error   text;
  v_has_conflict  boolean;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.club_role(v_reservation.club_id);
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to approve reservations for this club' USING ERRCODE = '42501';
  END IF;

  IF v_reservation.status <> 'pending' THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts
    WHERE id = v_reservation.court_id AND club_id = v_reservation.club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0004';
  END IF;

  v_hours_error := public._check_operating_hours(
    v_reservation.club_id, v_reservation.date, v_reservation.start_time, v_reservation.duration_minutes
  );
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  -- Same shared lock every create/edit path takes for this exact
  -- court+day (see the file header comment for the deadlock-freedom
  -- argument — this call also acquires at most one lock).
  PERFORM public._lock_court_date(v_reservation.court_id, v_reservation.date);

  -- Re-check status AFTER acquiring the lock — another admin could have
  -- approved or rejected this exact request while this call was waiting
  -- for a lock held by an unrelated create/edit for the same court+day.
  IF NOT EXISTS (
    SELECT 1 FROM public.reservations WHERE id = p_reservation_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;

  -- Confirmed-only, excluding this reservation's own row — identical
  -- semantics to the previous checkOverlap-based check ("PENDING doesn't
  -- block itself").
  v_has_conflict := public._check_reservation_conflict(
    v_reservation.court_id, v_reservation.date, v_reservation.start_time, v_reservation.duration_minutes,
    p_reservation_id, ARRAY['confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Time slot was confirmed for another reservation' USING ERRCODE = '23P01';
  END IF;

  UPDATE public.reservations
  SET status = 'confirmed'
  WHERE id = p_reservation_id AND status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_pending_reservation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pending_reservation(uuid) TO authenticated;


-- ─── notify_reservation_updated ─────────────────────────────────────────────
-- Unchanged from the previous version of this (unapplied) migration —
-- best-effort, called separately by the caller right after
-- update_reservation succeeds, same convention as
-- notify_reservation_cancelled. "Who edited" is derived from auth.uid()
-- at call time (same request as the update itself — there is no
-- updated_by column on reservations to persist this separately, unlike
-- cancelled_by/rejected_by).
CREATE OR REPLACE FUNCTION public.notify_reservation_updated(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation  public.reservations;
  v_editor_role  text;
  v_editor_name  text;
  v_club_slug    text;
  v_court_name   text;
  v_date_label   text;
  v_time_range   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_editor_role := public.club_role(v_reservation.club_id);
  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;
  SELECT name INTO v_court_name FROM public.courts WHERE id = v_reservation.court_id;

  v_date_label := CASE
    WHEN v_reservation.date = current_date THEN 'hoy'
    WHEN v_reservation.date = current_date + 1 THEN 'mañana'
    ELSE to_char(v_reservation.date, 'DD/MM')
  END;
  v_time_range := to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
    to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI');

  IF v_editor_role IN ('OWNER', 'ADMIN') THEN
    -- Notifies creator + participants (never the editor) — same
    -- created_by UNION reservation_players fan-out shape as
    -- notify_reservation_cancelled's admin-edited branch.
    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    SELECT DISTINCT
      affected.profile_id,
      v_reservation.club_id,
      'reservation_updated',
      'Reserva modificada',
      'El club modificó tu reserva. Nuevo horario: ' || COALESCE(v_court_name, 'la cancha') ||
        ' para ' || v_date_label || ' de ' || v_time_range || '.',
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
  ELSE
    SELECT full_name INTO v_editor_name FROM public.profiles WHERE id = auth.uid();

    -- Every active OWNER/ADMIN — same fan-out shape as
    -- notify_reservation_request_created.
    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    SELECT
      cm.profile_id,
      v_reservation.club_id,
      'reservation_updated',
      CASE WHEN v_reservation.status = 'pending' THEN 'Reserva modificada — requiere revisión' ELSE 'Reserva modificada' END,
      COALESCE(v_editor_name, 'Un jugador') || ' modificó su reserva. Nuevo horario: ' ||
        COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' || v_time_range ||
        CASE WHEN v_reservation.status = 'pending' THEN '. Requiere revisión.' ELSE '.' END,
      jsonb_build_object(
        'club_id', v_reservation.club_id,
        'club_slug', v_club_slug,
        'reservation_id', p_reservation_id,
        'destination', '/' || v_club_slug || '/admin/reservations/' || p_reservation_id
      )
    FROM public.club_members cm
    WHERE cm.club_id = v_reservation.club_id AND cm.role IN ('OWNER', 'ADMIN') AND cm.is_active = true;

    -- Other participants (the editor is always the creator here, never a
    -- participant-only row) learn the new schedule too.
    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    SELECT DISTINCT
      rp.profile_id,
      v_reservation.club_id,
      'reservation_updated',
      'Reserva modificada',
      'La reserva fue modificada por el jugador. Nuevo horario: ' ||
        COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' || v_time_range || '.',
      jsonb_build_object(
        'club_id', v_reservation.club_id,
        'club_slug', v_club_slug,
        'reservation_id', p_reservation_id,
        'destination', '/' || v_club_slug || '/reservations?reservationId=' || p_reservation_id
      )
    FROM public.reservation_players rp
    WHERE rp.reservation_id = p_reservation_id AND rp.profile_id <> auth.uid();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reservation_updated(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_reservation_updated(uuid) TO authenticated;
