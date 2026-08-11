-- Reservation edit policy by time status (shared/reservations/editPolicy.ts)
-- — a past reservation (its own current date+start_time+duration has
-- already ended) keeps título/notas/jugadores editable for administrative
-- correction, but court/date/start_time/duration/type are frozen to
-- preserve the historical record. Enforced here, not just in the UI: the
-- disabled inputs in ReservationForm/WeekReservationModal are a courtesy,
-- this RPC is the real authority (same principle as every other rule in
-- this function — re-validated server-side, never trusted from the
-- client).
--
-- This also fixes a real pre-existing side effect of
-- update_reservation_admin (20261106000001): its "new start time is in
-- the past" check (`v_new_start_at <= now()`) ran unconditionally, so
-- saving a TITLE-ONLY edit on an already-past reservation (court/date/
-- start_time/duration resubmitted unchanged, exactly what the UI already
-- does) already failed outright with that error — OWNER/ADMIN had no way
-- to correct título/notas/jugadores on a past reservation at all. That
-- check, and every other slot-occupancy check below it
-- (_check_operating_hours/_lock_court_date/_check_reservation_conflict/
-- the court-active-in-club check), now only runs when the slot itself is
-- actually changing — never a second implementation of any of those
-- rules, just gating when they apply.
CREATE OR REPLACE FUNCTION public.update_reservation_admin(
  p_reservation_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_type text,
  p_title text,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation           public.reservations;
  v_hours_error           text;
  v_has_conflict          boolean;
  v_new_start_at          timestamptz;
  v_current_end_at        timestamptz;
  v_is_past                boolean;
  v_slot_changed           boolean;
  v_restricted_fields_changed boolean;
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

  -- OWNER/ADMIN only — effective_club_role() already scopes to THIS
  -- reservation's club and requires is_active = true, same helper
  -- update_reservation itself uses for its own OWNER/ADMIN branch, and the
  -- same one CLAUDE.md's SUPERADMIN section requires for any new
  -- authorization check (never the older club_role()).
  IF COALESCE(public.effective_club_role(v_reservation.club_id), '') NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to edit this reservation' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_reservation.club_id);

  -- Same type/title validation create_reservation_admin already enforces
  -- — never a second, divergent copy of the rule.
  IF p_type NOT IN ('match', 'class', 'block') THEN
    RAISE EXCEPTION 'Invalid reservation type' USING ERRCODE = 'P0003';
  END IF;
  IF p_type = 'block' AND (p_title IS NULL OR btrim(p_title) = '') THEN
    RAISE EXCEPTION 'Title is required for a block' USING ERRCODE = 'P0003';
  END IF;

  -- "Past" is decided from the reservation's OWN current values (never
  -- the submitted p_date/p_start_time, which are frozen anyway once past)
  -- — same America/Bogota interpretation every other time comparison in
  -- this module already uses.
  v_current_end_at := (v_reservation.date + v_reservation.start_time) AT TIME ZONE 'America/Bogota'
    + (v_reservation.duration_minutes || ' minutes')::interval;
  v_is_past := v_current_end_at <= now();

  v_slot_changed := (
    p_court_id <> v_reservation.court_id
    OR p_date <> v_reservation.date
    OR p_start_time <> v_reservation.start_time
    OR p_duration_minutes <> v_reservation.duration_minutes
  );
  v_restricted_fields_changed := v_slot_changed OR p_type <> v_reservation.type;

  IF v_is_past AND v_restricted_fields_changed THEN
    RAISE EXCEPTION 'No puedes modificar cancha, fecha, hora, duración ni tipo de una reserva que ya pasó — solo título, notas y jugadores.' USING ERRCODE = 'P0006';
  END IF;

  -- Everything below only matters when the slot itself is actually moving
  -- — a título/notas-only save (the only thing a past reservation can
  -- still submit here) never needs to re-validate a slot it isn't
  -- touching, and for a future/ongoing reservation whose court/date/hora/
  -- duración aren't changing either, re-locking and re-checking the exact
  -- same slot it already legitimately occupies is redundant work, not a
  -- safety gap (p_exclude_id already excludes this reservation from its
  -- own conflict check either way).
  IF v_slot_changed THEN
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

    PERFORM public._lock_court_date(p_court_id, p_date);

    -- OWNER/ADMIN branch of update_reservation only ever conflict-checks
    -- against 'confirmed' reservations — same here, no 2-hour window
    -- either (this function is OWNER/ADMIN-only, never reached by a
    -- PLAYER).
    v_has_conflict := public._check_reservation_conflict(
      p_court_id, p_date, p_start_time, p_duration_minutes, p_reservation_id, ARRAY['confirmed']
    );
    IF v_has_conflict THEN
      RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
    END IF;
  END IF;

  -- Never touches created_by, club_id, status, is_open, closed_reason, or
  -- price_amount/price_currency — creator/club/status stay off-limits per
  -- CLAUDE.md, is_open/closed_reason remain the sole responsibility of
  -- set_reservation_open_status, and OWNER/ADMIN reservations are never
  -- priced regardless of type (Reservation Pricing Principles).
  UPDATE public.reservations
  SET court_id = p_court_id,
      date = p_date,
      start_time = p_start_time,
      duration_minutes = p_duration_minutes,
      type = p_type,
      title = p_title,
      notes = p_notes
  WHERE id = p_reservation_id AND status = v_reservation.status;
END;
$$;

REVOKE ALL ON FUNCTION public.update_reservation_admin(uuid, uuid, date, time, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_reservation_admin(uuid, uuid, date, time, integer, text, text, text) TO authenticated;
