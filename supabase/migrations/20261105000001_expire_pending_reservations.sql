-- ============================================================
-- Estado "expired" para solicitudes de reserva nunca resueltas
-- Mi Pádel Club
-- ============================================================
-- Una reserva 'pending' cuyo horario de inicio ya pasó sin que el club la
-- aprobara ni rechazara quedaba huérfana: seguía contando como "pendiente"
-- para siempre (bloqueando el horario, apareciendo en "Mis solicitudes" y
-- en el panel de OWNER/ADMIN como si aún se pudiera resolver), y podía
-- aprobarse después de su propio horario. Sin cron/Scheduler/Edge
-- Functions — se resuelve de forma perezosa (lazy), en el momento en que
-- alguien consulta o interactúa con reservas pendientes, exactamente el
-- mismo patrón que ya usa el resto del proyecto para "es esto pasado" (ver
-- 20260811000002_fix_reservation_cancellation_timezone.sql: date+start_time
-- reinterpretado como America/Bogota, comparado contra now()).
--
-- expire_pending_reservations(p_club_id) es la única función que decide
-- esto — nunca duplicada: approve_pending_reservation y
-- get_reservation_share_detail la llaman internamente (PERFORM) antes de
-- decidir/mostrar nada, y el resto de callers (listas de "Mis
-- solicitudes"/pendientes en el dashboard, la revisión dedicada de OWNER/
-- ADMIN) la llaman explícitamente antes de su propio SELECT — mismo
-- principio que ya sigue el resto del proyecto (una sola función SQL,
-- reutilizada, nunca reimplementada por caller).
--
-- get_reservation_share_detail deja de ser STABLE: ahora puede escribir
-- (vía el PERFORM anidado) — mantenerla marcada STABLE sería una promesa
-- falsa al planner.
-- ============================================================

-- ─── 1. Estado válido ───────────────────────────────────────────────────────

ALTER TABLE public.reservations
  DROP CONSTRAINT reservations_valid_status;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_valid_status
  CHECK (status IN ('confirmed', 'cancelled', 'pending', 'rejected', 'expired'));

-- ─── 2. expire_pending_reservations — función central ──────────────────────
-- Marca 'expired' toda reserva 'pending' de p_club_id (o de cualquier club
-- si es NULL) cuyo start_time ya pasó, y notifica una sola vez a cada
-- jugador afectado. Idempotente por construcción: la propia condición
-- WHERE status = 'pending' hace que una fila ya expirada nunca vuelva a
-- matchear en una llamada posterior, así que RETURNING solo trae las filas
-- que ESTA llamada acaba de cambiar — nunca reinserta una notificación para
-- una fila ya resuelta antes.
CREATE OR REPLACE FUNCTION public.expire_pending_reservations(p_club_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  WITH newly_expired AS (
    UPDATE public.reservations r
    SET status = 'expired'
    WHERE r.status = 'pending'
      AND (p_club_id IS NULL OR r.club_id = p_club_id)
      -- Mismo criterio "es esto pasado" que cancel_reservation ya usa:
      -- date+start_time reinterpretado como America/Bogota (única zona
      -- operativa del producto, sin DST) contra el instante real now().
      AND (r.date + r.start_time) AT TIME ZONE 'America/Bogota' < now()
    RETURNING r.id, r.club_id, r.created_by
  )
  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    ne.created_by,
    ne.club_id,
    'reservation_request_expired',
    'Solicitud de reserva expirada',
    'Tu solicitud no fue aprobada por el club antes del horario programado.',
    jsonb_build_object(
      'reservation_id', ne.id,
      -- uuid crudo como segmento — resoluble de inmediato por
      -- extractReservationId (vía 1), sin depender de resolve_reservation_slug
      -- ni de ningún nombre (ver el bug real corregido en
      -- 20261105000001 turno previo: un slug sin uuid embebido nunca
      -- resuelve si no hay coincidencia exacta de nombre).
      'destination', '/' || cl.slug || '/reservations/' || ne.id
    )
  FROM newly_expired ne
  JOIN public.clubs cl ON cl.id = ne.club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_pending_reservations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_pending_reservations(uuid) TO authenticated;

-- ─── 3. approve_pending_reservation — nunca aprueba una vencida ────────────
-- Cuerpo idéntico al realmente instalado (confirmado vía pg_get_functiondef
-- contra la base enlazada, no solo el archivo local — incluye
-- effective_club_role, no club_role), con un solo agregado: resolver
-- expiraciones de este club (incluida esta misma reserva) y releer su
-- estado antes de decidir si sigue siendo 'pending'. Todo lo demás —
-- firma, permisos, orden de validaciones, el lock, el chequeo de
-- conflicto, el UPDATE final — sin cambios.
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

  v_role := public.effective_club_role(v_reservation.club_id);
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to approve reservations for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_reservation.club_id);

  -- Resuelve solicitudes vencidas de este club (incluida esta misma, si su
  -- hora de inicio ya pasó) antes de decidir si todavía se puede aprobar —
  -- "no permitir aprobarla posteriormente" una vez expirada.
  PERFORM public.expire_pending_reservations(v_reservation.club_id);
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;

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

  PERFORM public._lock_court_date(v_reservation.court_id, v_reservation.date);

  IF NOT EXISTS (
    SELECT 1 FROM public.reservations WHERE id = p_reservation_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;

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

-- ─── 4. get_reservation_share_detail — refleja 'expired' al consultar ─────
-- Cuerpo idéntico al realmente instalado (confirmado vía
-- pg_get_functiondef, incluye price_amount/price_currency de
-- 20261104000001), con dos cambios: ya no es STABLE (ahora puede escribir
-- vía el PERFORM anidado — mantenerla STABLE sería una promesa falsa al
-- planner), y resuelve expiraciones de este club + relee la reserva antes
-- de construir el jsonb, para que una 'pending' vencida se muestre como
-- 'expired' en vez de una lectura obsoleta.
CREATE OR REPLACE FUNCTION public.get_reservation_share_detail(p_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation  public.reservations;
  v_role         text;
  v_result       jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.club_role(v_reservation.club_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not an active member of this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public.expire_pending_reservations(v_reservation.club_id);
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;

  SELECT jsonb_build_object(
    'reservation', jsonb_build_object(
      'id', v_reservation.id,
      'status', v_reservation.status,
      'is_open', v_reservation.is_open,
      'date', v_reservation.date,
      'start_time', v_reservation.start_time,
      'duration_minutes', v_reservation.duration_minutes,
      'type', v_reservation.type,
      'court_name', crt.name,
      'created_by', v_reservation.created_by,
      'creator_name', creator.full_name,
      'is_creator', v_reservation.created_by = auth.uid(),
      'price_amount', v_reservation.price_amount,
      'price_currency', v_reservation.price_currency
    ),
    'club', jsonb_build_object(
      'id', cl.id,
      'name', cl.name,
      'slug', cl.slug
    ),
    'can_manage', COALESCE(v_role, '') IN ('OWNER', 'ADMIN') OR v_reservation.created_by = auth.uid(),
    'player_count', public._reservation_effective_player_count(p_reservation_id),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'profile_id', pl.profile_id,
        'full_name', pl.full_name,
        'avatar_url', pl.avatar_url,
        'category', pl.category
      ) ORDER BY pl.full_name)
      FROM (
        SELECT
          member.profile_id, prof.full_name, prof.avatar_url,
          cyc.category
        FROM (
          SELECT profile_id FROM public.reservation_players WHERE reservation_id = p_reservation_id
          UNION
          SELECT v_reservation.created_by
          WHERE EXISTS (
            SELECT 1 FROM public.club_members ccm
            WHERE ccm.club_id = v_reservation.club_id AND ccm.profile_id = v_reservation.created_by
              AND ccm.role = 'PLAYER'
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.reservation_players rp2
            WHERE rp2.reservation_id = p_reservation_id AND rp2.profile_id = v_reservation.created_by
          )
        ) member
        JOIN public.profiles prof ON prof.id = member.profile_id
        LEFT JOIN public.club_members pcm ON pcm.club_id = v_reservation.club_id AND pcm.profile_id = member.profile_id
        LEFT JOIN public.club_member_sport_state sps ON sps.club_member_id = pcm.id
        LEFT JOIN public.club_ranking_cycles cyc ON cyc.id = sps.cycle_id
      ) pl
    ), '[]'::jsonb),
    'my_request', (
      SELECT jsonb_build_object('id', jr.id, 'status', jr.status)
      FROM public.reservation_join_requests jr
      WHERE jr.reservation_id = p_reservation_id AND jr.profile_id = auth.uid()
      ORDER BY jr.created_at DESC
      LIMIT 1
    ),
    'am_participant', EXISTS (
      SELECT 1 FROM public.reservation_players WHERE reservation_id = p_reservation_id AND profile_id = auth.uid()
    ),
    'has_schedule_conflict', EXISTS (
      SELECT 1 FROM public.reservations other
      WHERE other.id <> p_reservation_id
        AND other.status IN ('pending', 'confirmed')
        AND (
          other.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.reservation_players orp
            WHERE orp.reservation_id = other.id AND orp.profile_id = auth.uid()
          )
        )
        AND other.date = v_reservation.date
        AND other.start_time < (v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval)
        AND (other.start_time + (other.duration_minutes || ' minutes')::interval) > v_reservation.start_time
    )
  )
  INTO v_result
  FROM public.clubs cl
  LEFT JOIN public.courts crt ON crt.id = v_reservation.court_id
  LEFT JOIN public.profiles creator ON creator.id = v_reservation.created_by
  WHERE cl.id = v_reservation.club_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reservation_share_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reservation_share_detail(uuid) TO authenticated;
