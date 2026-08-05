-- ============================================================
-- notify_reservation_approved — fix: el PLAYER nunca era notificado al
-- aprobar su solicitud de reserva
-- Mi Pádel Club
-- ============================================================
-- Auditoría: approve_pending_reservation solo cambia reservations.status a
-- 'confirmed' — nunca inserta una notificación. approvePendingReservation
-- (admin/reservations/actions.ts) solo llama, después, a
-- resolve_reservation_request_notifications, que únicamente actualiza el
-- resolved_status de las notificaciones 'reservation_request_created' que
-- ya tienen los OWNER/ADMIN — nunca crea una fila nueva para el jugador.
-- Compárese con rejectPendingReservation, que sí llama a
-- notify_reservation_rejected. notifications no tiene policy de INSERT
-- para authenticated (solo funciones SECURITY DEFINER escriben ahí), así
-- que la única forma de reutilizar el sistema existente es una función
-- nueva, simétrica a notify_reservation_rejected (mismo patrón: auth,
-- autorización OWNER/ADMIN, idempotencia por reservation_id, mensaje con
-- cancha/fecha/hora). Única diferencia real: el destino apunta al detalle
-- de la reserva (/[club]/reservations/[reservationId], la página agregada
-- en 20261031000001) en vez del ancla #mis-solicitudes que usa el rechazo
-- — clic en la notificación de aprobación abre el mismo detalle que ahora
-- abren el calendario y "Mis reservas" (fix de la segunda regresión).
--
-- La sincronización de resolved_status en las notificaciones
-- 'reservation_request_created' de los OWNER/ADMIN sigue siendo
-- responsabilidad exclusiva de resolve_reservation_request_notifications
-- (ya se llama desde approvePendingReservation) — no se duplica aquí.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_reservation_approved(p_reservation_id uuid)
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

  -- Misma autorización que notify_reservation_rejected — esta RPC solo
  -- narra una aprobación que ya ocurrió, nunca la decide.
  IF public.effective_club_role(v_reservation.club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Idempotente por reservation_id — una llamada reintentada nunca duplica.
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'reservation_request_approved'
      AND (metadata->>'reservation_id')::uuid = p_reservation_id
  ) THEN
    SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;
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
      'reservation_request_approved',
      'Solicitud aprobada',
      'Tu solicitud de la ' || COALESCE(v_court_name, 'cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI') ||
        ' fue aprobada.',
      jsonb_build_object(
        'club_id', v_reservation.club_id,
        'club_slug', v_club_slug,
        'reservation_id', p_reservation_id,
        'destination', '/' || v_club_slug || '/reservations/' || p_reservation_id
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reservation_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_reservation_approved(uuid) TO authenticated;
