-- OWNER/ADMIN reservation editing was deliberately restricted to court/
-- date/start_time/duration during the MVP (see update_reservation,
-- 20260814000001) — this expands OWNER/ADMIN's own editing capability to
-- also cover type/title/notes, as a real product-scope decision (not a
-- bug fix). update_reservation itself is left completely untouched and
-- keeps serving PLAYER's own edit flow (create_reservation_player's
-- creator, 2-hour window, never type/title/notes/participants) exactly as
-- before — this is a new, separate, OWNER/ADMIN-only function, never a
-- second implementation of the schedule-validation rules it needs (same
-- _check_operating_hours/_lock_court_date/_check_reservation_conflict/
-- _require_club_not_archived helpers update_reservation and
-- create_reservation_admin already share). The reservation_players list
-- itself is deliberately NOT touched here — the caller (Server Action /
-- mobile lib) syncs it separately via direct insert/delete against
-- reservation_players, the same table-level RLS already used at creation
-- (see shared/reservations/playerSync.ts), so this function's own
-- responsibility stays exactly what its name says: the reservations row.
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
  v_reservation  public.reservations;
  v_hours_error  text;
  v_has_conflict boolean;
  v_new_start_at timestamptz;
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
  -- against 'confirmed' reservations — same here, no 2-hour window either
  -- (this function is OWNER/ADMIN-only, never reached by a PLAYER).
  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, p_reservation_id, ARRAY['confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
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
