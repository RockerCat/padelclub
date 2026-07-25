-- ============================================================
-- Reservation created directly by OWNER/ADMIN — notify participants
-- Mi Pádel Club
-- ============================================================
-- createReservation (admin/reservations/actions.ts) already inserts the
-- confirmed reservation, then the player rows into reservation_players —
-- that flow is untouched by this migration. Until now, no notification was
-- ever created for the added players: notify_reservation_request_created
-- only fires for the opposite flow (a PLAYER requesting, notifying OWNER/
-- ADMIN), and there is no player-facing equivalent for a reservation the
-- club creates directly with no prior request.
--
-- Reuses the same SECURITY DEFINER pattern as notify_reservation_request_
-- created/notify_reservation_rejected (20260801000001, 20260804000001):
-- notifications has no INSERT policy for arbitrary profile_id, so fanning
-- out one row per participant needs a definer function. Re-derives
-- recipients from reservation_players itself — never from client-submitted
-- player ids — and is idempotent per (reservation, player), so a retried
-- call (or two admins somehow triggering it twice) never double-notifies.
-- No RLS change: notifications_select_own/notifications_update_own already
-- scope each recipient to their own row, same as every other notification
-- type.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_reservation_created_for_players(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation  public.reservations;
  v_club_slug    text;
  v_court_name   text;
  v_date_label   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND OR v_reservation.status <> 'confirmed' THEN
    RETURN;
  END IF;

  -- Same authorization createReservation itself already enforces
  -- (requireAdminRole) — kept here too since this is SECURITY DEFINER and
  -- must not be callable to notify about a reservation in a club the
  -- caller has no OWNER/ADMIN role in.
  IF public.club_role(v_reservation.club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;
  SELECT name INTO v_court_name FROM public.courts WHERE id = v_reservation.court_id;

  v_date_label := CASE
    WHEN v_reservation.date = current_date THEN 'hoy'
    WHEN v_reservation.date = current_date + 1 THEN 'mañana'
    ELSE to_char(v_reservation.date, 'DD/MM')
  END;

  -- One notification per linked player, re-derived from reservation_players
  -- itself (the real, already-persisted relation — never the client's
  -- player id list). NOT EXISTS makes this safe to call more than once for
  -- the same reservation: already-notified players are skipped, so a retry
  -- (or a second admin) never produces duplicates.
  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    rp.profile_id,
    v_reservation.club_id,
    'reservation_created_for_player',
    'Reserva agendada',
    'El club agendó una reserva a tu nombre en la ' || COALESCE(v_court_name, 'cancha') ||
      ' para ' || v_date_label || ' de ' ||
      to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
      to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
    jsonb_build_object(
      'club_id', v_reservation.club_id,
      'club_slug', v_club_slug,
      'reservation_id', p_reservation_id,
      'destination', '/' || v_club_slug || '/reservations?reservationId=' || p_reservation_id
    )
  FROM public.reservation_players rp
  WHERE rp.reservation_id = p_reservation_id
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.type = 'reservation_created_for_player'
        AND n.profile_id = rp.profile_id
        AND (n.metadata->>'reservation_id')::uuid = p_reservation_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reservation_created_for_players(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_reservation_created_for_players(uuid) TO authenticated;
