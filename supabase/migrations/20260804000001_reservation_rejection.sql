-- ============================================================
-- Reservation rejection — reason, traceability, player notification
-- Mi Pádel Club
-- ============================================================
-- Until now rejectPendingReservation (admin/reservations/actions.ts) reused
-- status = 'cancelled' for a rejected PENDING request, with no reason
-- captured anywhere and no notification ever sent to the requesting
-- player. This migration:
--
--   1. Adds a distinct 'rejected' status, kept separate from 'cancelled'
--      ('cancelled' stays reserved for a previously CONFIRMED reservation
--      that gets cancelled — a different concept, untouched here).
--   2. Adds the reason/traceability columns. All nullable — every existing
--      row (including historical 'cancelled' rows from the old
--      reject-via-cancel path) keeps NULL here, never backfilled.
--   3. Adds notify_reservation_rejected, a SECURITY DEFINER RPC that
--      inserts the player-facing notification and resolves every
--      recipient OWNER/ADMIN's own reservation_request_created
--      notification for this request — same shared-resolution convention
--      as resolve_reservation_request_notifications (20260803000001),
--      which stays exactly as-is and keeps serving the approve path.
-- ============================================================

ALTER TABLE public.reservations
  DROP CONSTRAINT reservations_valid_status;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_valid_status
  CHECK (status IN ('confirmed', 'cancelled', 'pending', 'rejected'));

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS rejection_reason_code text,
  ADD COLUMN IF NOT EXISTS rejection_reason      text,
  ADD COLUMN IF NOT EXISTS rejected_at            timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by            uuid REFERENCES public.profiles(id);

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_valid_rejection_reason_code
  CHECK (
    rejection_reason_code IS NULL OR rejection_reason_code IN (
      'court_unavailable',
      'court_maintenance',
      'schedule_unavailable',
      'club_event',
      'duplicate_request',
      'other'
    )
  );

-- Player-readable explanation, never blank/whitespace-only once set —
-- mirrors the same "no motivo vacío" rule enforced server-side in
-- rejectPendingReservation.
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_rejection_reason_not_blank
  CHECK (rejection_reason IS NULL OR length(btrim(rejection_reason)) > 0);

CREATE OR REPLACE FUNCTION public.notify_reservation_rejected(p_reservation_id uuid)
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
  IF NOT FOUND OR v_reservation.status <> 'rejected' THEN
    RETURN;
  END IF;

  -- Same authorization as the reservation UPDATE itself (admins update
  -- reservations RLS) — this RPC only ever narrates a rejection that
  -- already happened, never decides it.
  IF public.club_role(v_reservation.club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;

  -- Idempotent per reservation_id — a retried client call can't double-notify.
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'reservation_request_rejected'
      AND (metadata->>'reservation_id')::uuid = p_reservation_id
  ) THEN
    SELECT name INTO v_court_name FROM public.courts WHERE id = v_reservation.court_id;

    v_date_label := CASE
      WHEN v_reservation.date = current_date THEN 'hoy'
      WHEN v_reservation.date = current_date + 1 THEN 'mañana'
      ELSE to_char(v_reservation.date, 'DD/MM')
    END;

    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    VALUES (
      v_reservation.created_by,
      v_reservation.club_id,
      'reservation_request_rejected',
      'Solicitud rechazada',
      'Tu solicitud de la ' || COALESCE(v_court_name, 'cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI') ||
        ' fue rechazada. Motivo: ' || v_reservation.rejection_reason,
      jsonb_build_object(
        'club_id', v_reservation.club_id,
        'club_slug', v_club_slug,
        'reservation_id', p_reservation_id,
        'destination', '/' || v_club_slug || '/reservations#mis-solicitudes'
      )
    );
  END IF;

  -- Shared resolution — every OWNER/ADMIN's own reservation_request_created
  -- notification for this reservation flips together, same convention as
  -- resolve_reservation_request_notifications.
  UPDATE public.notifications
  SET resolved_status = 'rejected', resolved_at = now()
  WHERE type = 'reservation_request_created'
    AND (metadata->>'reservation_id')::uuid = p_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reservation_rejected(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_reservation_rejected(uuid) TO authenticated;
