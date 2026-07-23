-- ============================================================
-- Reservation request notification — notify_reservation_request_created
-- Mi Pádel Club
-- ============================================================
-- requestReservation (src/app/(app)/[club]/reservations/actions.ts) already
-- inserts a 'pending' reservation directly via the existing "members insert
-- pending reservations" RLS policy — that insert path is untouched by this
-- migration. Notifying every active OWNER/ADMIN of the club needs a
-- SECURITY DEFINER function, exactly like create_join_request
-- (20260729000001): the requester isn't one of them, and `notifications`
-- has no INSERT policy for regular users.
--
-- Guarded so this can only ever notify about the caller's own,
-- still-pending reservation (never someone else's, never a since-resolved
-- one), and is idempotent per reservation_id so a retried client call can't
-- double-notify. metadata.destination is stored at creation time (same
-- pattern as create_join_request) so the bell/`/notifications` click never
-- has to re-derive the review route.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_reservation_request_created(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation  public.reservations;
  v_club_slug    text;
  v_court_name   text;
  v_player_name  text;
  v_date_label   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_reservation.created_by <> auth.uid() OR v_reservation.status <> 'pending' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'reservation_request_created'
      AND (metadata->>'reservation_id')::uuid = p_reservation_id
  ) THEN
    RETURN;
  END IF;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;
  SELECT name INTO v_court_name FROM public.courts WHERE id = v_reservation.court_id;
  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = v_reservation.created_by;

  v_date_label := CASE
    WHEN v_reservation.date = current_date THEN 'hoy'
    WHEN v_reservation.date = current_date + 1 THEN 'mañana'
    ELSE to_char(v_reservation.date, 'DD/MM')
  END;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    v_reservation.club_id,
    'reservation_request_created',
    'Nueva solicitud de reserva',
    COALESCE(v_player_name, 'Un jugador') || ' solicitó la ' || COALESCE(v_court_name, 'cancha') ||
      ' para ' || v_date_label || ' de ' ||
      to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
      to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
    jsonb_build_object(
      'club_id', v_reservation.club_id,
      'club_slug', v_club_slug,
      'reservation_id', p_reservation_id,
      'requester_profile_id', v_reservation.created_by,
      'destination', '/' || v_club_slug || '/admin/reservations/' || p_reservation_id
    )
  FROM public.club_members cm
  WHERE cm.club_id = v_reservation.club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reservation_request_created(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_reservation_request_created(uuid) TO authenticated;
