-- ============================================================
-- Reservas Abiertas/Cerradas + solicitudes para unirse
-- Mi Pádel Club
-- ============================================================
-- Extiende el sistema de reservas existente (nunca un módulo paralelo de
-- "partidos"): cada reserva ya tiene court/date/start_time/duration/type/
-- status/created_by/reservation_players — esta migración solo agrega (a)
-- un estado de participación Abierta/Cerrada sobre esa misma fila, y (b)
-- una tabla de solicitudes para unirse, resuelta con el mismo mecanismo de
-- participantes (reservation_players) que ya usa create_reservation_admin.
--
-- ─── Modelo ─────────────────────────────────────────────────────────────────
-- reservations.is_open      — bool, default false. No representa si la
--                              reserva está confirmada/pagada/completa
--                              (eso sigue siendo reservations.status) — solo
--                              si acepta solicitudes de otros jugadores.
-- reservations.closed_reason — 'manual' | 'auto_full' | NULL (NULL mientras
--                              is_open = true). Distingue un cierre
--                              deliberado (creador/OWNER/ADMIN, nunca se
--                              reabre solo) de un cierre automático al
--                              llegar a 4 jugadores (si luego baja de 4 por
--                              un retiro/eliminación, vuelve a abrirse sola
--                              — ver _maybe_reopen_reservation).
-- reservation_join_requests  — una fila por solicitud individual (nunca por
--                              pareja). pending/approved/rejected, con un
--                              índice único parcial que solo prohíbe una
--                              solicitud PENDING duplicada — una fila
--                              rechazada no bloquea un reintento futuro (el
--                              spec solo prohíbe "ya tiene una solicitud
--                              pendiente", nunca reintentar tras rechazo).
--
-- "Cantidad efectiva de jugadores" (el número contra el que se compara el
-- límite de 4) se calcula en _reservation_effective_player_count: cuenta
-- reservation_players y, si el creador es PLAYER y todavía no tiene su
-- propia fila ahí (caso normal de una reserva creada por un PLAYER para sí
-- mismo, sin selector de jugadores), lo suma como 1 — exactamente la misma
-- regla de fallback que ReservationTicketPanel ya usa para pintar
-- "Jugadores" (jugadoresIds). La primera aprobación sobre una reserva así
-- inserta también al creador en reservation_players (antes de insertar al
-- solicitante) para que esa fila deje de depender del fallback — sin este
-- paso, el panel existente (que usa reservation_players.length > 0 como
-- interruptor exclusivo, nunca una unión de ambas fuentes) mostraría solo
-- al nuevo jugador y perdería al creador de la lista.
--
-- ─── Seguridad ──────────────────────────────────────────────────────────────
-- Todo el módulo pasa por RPCs SECURITY DEFINER; reservation_join_requests
-- no tiene policy de INSERT/UPDATE para authenticated (mismo patrón que
-- notifications) — la única forma de escribir ahí es a través de estas
-- funciones, nunca un INSERT/UPDATE directo desde el cliente. Cada chequeo
-- de rol nuevo usa COALESCE(rol, '') NOT IN (...) — nunca `rol NOT IN (...)`
-- a secas — porque `NULL NOT IN (...)` es NULL, y en PL/pgSQL una condición
-- NULL en IF se trata como false (no lanza), dejando pasar a un no-miembro.
-- La cuenta de jugadores y el cierre automático al llegar a 4 se resuelven
-- con un FOR UPDATE sobre la fila de reservations dentro de
-- approve_reservation_join_request, así que dos aprobaciones simultáneas
-- para el último cupo siempre serializan — solo una puede ganar.
-- ============================================================

-- ─── 1. Columnas nuevas en reservations ────────────────────────────────────

ALTER TABLE public.reservations
  ADD COLUMN is_open      boolean NOT NULL DEFAULT false,
  ADD COLUMN closed_reason text CHECK (closed_reason IN ('manual', 'auto_full'));

COMMENT ON COLUMN public.reservations.is_open IS
  'Si acepta solicitudes de otros jugadores del club. Independiente de status (confirmed/pending/...).';
COMMENT ON COLUMN public.reservations.closed_reason IS
  'manual = cerrada a propósito por creador/OWNER/ADMIN (nunca se reabre sola). auto_full = cerrada automáticamente al llegar a 4 jugadores (se reabre sola si vuelve a bajar de 4). NULL mientras is_open = true.';


-- ─── 2. Tabla reservation_join_requests ────────────────────────────────────

CREATE TABLE public.reservation_join_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   uuid        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  -- Denormalizado desde reservations.club_id: evita un JOIN en cada policy
  -- de RLS (mismo patrón que club_join_requests.club_id) y aísla
  -- multi-tenant sin depender de una subconsulta. Siempre escrito por la
  -- RPC a partir de la reserva real, nunca confiado del cliente.
  club_id          uuid        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  profile_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  resolved_by      uuid        REFERENCES public.profiles(id),
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Solo una solicitud PENDING activa por (reserva, jugador) — un índice
-- único parcial en vez de UNIQUE(reservation_id, profile_id) completo,
-- para permitir un reintento después de un rechazo (el spec solo prohíbe
-- una solicitud pendiente duplicada, nunca reintentar tras rechazo).
CREATE UNIQUE INDEX reservation_join_requests_one_pending_idx
  ON public.reservation_join_requests (reservation_id, profile_id)
  WHERE status = 'pending';

CREATE INDEX reservation_join_requests_reservation_idx ON public.reservation_join_requests (reservation_id);
CREATE INDEX reservation_join_requests_club_status_idx  ON public.reservation_join_requests (club_id, status);
CREATE INDEX reservation_join_requests_profile_idx      ON public.reservation_join_requests (profile_id);

ALTER TABLE public.reservation_join_requests ENABLE ROW LEVEL SECURITY;

-- Lectura: el propio solicitante, el creador de la reserva (puede ser un
-- PLAYER sin acceso a /admin), o cualquier OWNER/ADMIN activo del club —
-- exactamente quienes la sección 11/página compartida necesitan mostrar
-- esto. Nunca un miembro cualquiera del club ni un visitante externo.
CREATE POLICY "reservation_join_requests_select"
  ON public.reservation_join_requests FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.effective_club_role(club_id) IN ('OWNER', 'ADMIN')
    OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id AND r.created_by = auth.uid()
    )
  );

-- Sin policy de INSERT/UPDATE: toda escritura pasa por las RPCs
-- SECURITY DEFINER de abajo (mismo patrón que notifications) — un INSERT
-- directo desde el cliente jamás podría validar el aislamiento multi-club,
-- el tope de 4 jugadores, ni el bloqueo concurrente que approve necesita.


-- ─── 3. _reservation_effective_player_count ────────────────────────────────
-- Reservation_players + 1 si el creador es PLAYER y aún no tiene su propia
-- fila ahí — la misma regla de fallback que ReservationTicketPanel ya usa
-- para "Jugadores" (jugadoresIds), reimplementada en SQL para que el tope
-- de 4 y el conteo mostrado en la página compartida usen exactamente la
-- misma cuenta que ya ve un OWNER/ADMIN en el modal de detalle.
CREATE OR REPLACE FUNCTION public._reservation_effective_player_count(p_reservation_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count        integer;
  v_created_by   uuid;
  v_creator_role text;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.reservation_players
  WHERE reservation_id = p_reservation_id;

  SELECT r.created_by INTO v_created_by FROM public.reservations r WHERE r.id = p_reservation_id;
  IF v_created_by IS NULL THEN
    RETURN v_count;
  END IF;

  SELECT cm.role INTO v_creator_role
  FROM public.reservations r
  JOIN public.club_members cm ON cm.club_id = r.club_id AND cm.profile_id = r.created_by
  WHERE r.id = p_reservation_id
  LIMIT 1;

  IF v_creator_role = 'PLAYER' AND NOT EXISTS (
    SELECT 1 FROM public.reservation_players
    WHERE reservation_id = p_reservation_id AND profile_id = v_created_by
  ) THEN
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public._reservation_effective_player_count(uuid) FROM PUBLIC;


-- ─── 4. _maybe_reopen_reservation ───────────────────────────────────────────
-- Reabre automáticamente una reserva que se había cerrado SOLO por llegar a
-- 4 (closed_reason = 'auto_full') cuando, tras un retiro/eliminación de
-- participante, vuelve a tener menos de 4. Una reserva cerrada
-- manualmente (closed_reason = 'manual') nunca entra por este WHERE, así
-- que nunca se reabre sola — la única forma de reabrirla es la acción
-- explícita (set_reservation_open_status). No-op silencioso si no aplica.
CREATE OR REPLACE FUNCTION public._maybe_reopen_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.reservations
  SET is_open = true, closed_reason = NULL
  WHERE id = p_reservation_id
    AND status = 'confirmed'
    AND is_open = false
    AND closed_reason = 'auto_full'
    AND public._reservation_effective_player_count(p_reservation_id) < 4;
END;
$$;

REVOKE ALL ON FUNCTION public._maybe_reopen_reservation(uuid) FROM PUBLIC;


-- ─── 5. _reject_pending_reservation_join_requests ──────────────────────────
-- Helper compartido por cancel_reservation, set_reservation_open_status
-- (cierre manual) y approve_reservation_join_request (cierre automático al
-- completar 4) — rechaza toda solicitud PENDING de una reserva con un
-- motivo fijo del sistema y notifica a cada solicitante, sin duplicar esta
-- lógica tres veces. p_actor_id es quien disparó el evento (para
-- resolved_by) — puede ser NULL en el caso de cierre automático por
-- completar 4, donde no hay un "rechazador" humano.
CREATE OR REPLACE FUNCTION public._reject_pending_reservation_join_requests(
  p_reservation_id uuid,
  p_reason_text    text,
  p_actor_id       uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id   uuid;
  v_club_slug text;
  v_req       RECORD;
BEGIN
  SELECT club_id INTO v_club_id FROM public.reservations WHERE id = p_reservation_id;
  IF v_club_id IS NULL THEN
    RETURN;
  END IF;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_club_id;

  FOR v_req IN
    UPDATE public.reservation_join_requests
    SET status = 'rejected', rejection_reason = p_reason_text,
        resolved_by = p_actor_id, resolved_at = now()
    WHERE reservation_id = p_reservation_id AND status = 'pending'
    RETURNING id, profile_id
  LOOP
    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    VALUES (
      v_req.profile_id,
      v_club_id,
      'reservation_join_request_rejected',
      'Solicitud rechazada',
      p_reason_text,
      jsonb_build_object(
        'club_id', v_club_id,
        'club_slug', v_club_slug,
        'reservation_id', p_reservation_id,
        'join_request_id', v_req.id,
        'destination', '/' || v_club_slug || '/reservations/' || p_reservation_id
      )
    );

    UPDATE public.notifications
    SET resolved_status = 'rejected', resolved_at = now()
    WHERE type = 'reservation_join_request_created'
      AND (metadata->>'join_request_id')::uuid = v_req.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._reject_pending_reservation_join_requests(uuid, text, uuid) FROM PUBLIC;


-- ─── 6. create_reservation_player — + p_is_open ────────────────────────────
-- Reproduce por completo la versión vigente (20260815000001, incluye la
-- guarda de club archivado) — único cambio: un parámetro nuevo al final con
-- DEFAULT (compatible con cualquier llamador existente que no lo mande) que
-- se persiste tal cual. Sin selector de jugadores en este flujo (el PLAYER
-- nunca agrega a otros al crear), así que el tope de 4 nunca aplica aquí.
CREATE OR REPLACE FUNCTION public.create_reservation_player(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_is_open boolean DEFAULT false
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

  PERFORM public._require_club_not_archived(p_club_id);

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
    price_amount, price_currency, pricing_rule_id, price_calculated_at,
    is_open, closed_reason
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, 'match', 'pending',
    v_price.o_price_amount, v_price.o_price_currency, v_price.o_pricing_rule_id, now(),
    p_is_open, CASE WHEN p_is_open THEN NULL ELSE 'manual' END
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer, boolean) TO authenticated;


-- ─── 7. create_reservation_admin — + p_is_open, p_player_count ─────────────
-- Reproduce la versión vigente (20261008000001, con effective_club_role) —
-- agrega dos parámetros al final con DEFAULT. p_player_count es la cantidad
-- de jugadores que el propio caller (createReservation, admin/reservations/
-- actions.ts) va a insertar en reservation_players justo después de esta
-- llamada — la RPC decide el estado final (nunca confía ciegamente en
-- p_is_open): 4+ jugadores siempre fuerza Cerrada, sin importar lo que pida
-- el formulario. Esto es intencional server-side enforcement, no solo un
-- valor calculado en el Server Action.
CREATE OR REPLACE FUNCTION public.create_reservation_admin(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_type text,
  p_title text,
  p_notes text,
  p_is_open boolean DEFAULT false,
  p_player_count integer DEFAULT 0
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
  v_effective_open boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.effective_club_role(p_club_id), '') NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to create reservations for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

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

  v_effective_open := p_is_open AND COALESCE(p_player_count, 0) < 4;

  INSERT INTO public.reservations (
    club_id, court_id, created_by, date, start_time, duration_minutes, type, status, title, notes,
    is_open, closed_reason
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, p_type, 'confirmed', p_title, p_notes,
    v_effective_open,
    CASE
      WHEN v_effective_open THEN NULL
      WHEN COALESCE(p_player_count, 0) >= 4 THEN 'auto_full'
      ELSE 'manual'
    END
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text, boolean, integer) TO authenticated;


-- ─── 8. notify_reservation_updated — + solicitantes pendientes ─────────────
-- Reproduce la versión vigente (20260814000001) sin tocar ninguna de sus
-- dos ramas OWNER/ADMIN vs PLAYER — agrega un tercer INSERT, después de
-- ambas, que notifica a todo solicitante con una solicitud PENDING sobre
-- esta reserva, sin importar quién editó. Nunca rechaza ni elimina esas
-- solicitudes (el spec es explícito: una edición nunca resuelve
-- solicitudes por sí sola) — solo informa el nuevo horario.
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

  -- Solicitantes pendientes — independiente de quién editó, siempre que no
  -- sean ellos mismos el editor (un PLAYER con una solicitud propia nunca
  -- puede ser también quien edita esta reserva, pero el filtro se deja por
  -- consistencia con las dos ramas de arriba).
  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT DISTINCT
    jr.profile_id,
    v_reservation.club_id,
    'reservation_join_request_reservation_updated',
    'La reserva a la que solicitaste unirte cambió',
    'Nuevo horario: ' || COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' || v_time_range || '.',
    jsonb_build_object(
      'club_id', v_reservation.club_id,
      'club_slug', v_club_slug,
      'reservation_id', p_reservation_id,
      'destination', '/' || v_club_slug || '/reservations/' || p_reservation_id
    )
  FROM public.reservation_join_requests jr
  WHERE jr.reservation_id = p_reservation_id AND jr.status = 'pending' AND jr.profile_id <> auth.uid();
END;
$$;


-- ─── 9. cancel_reservation — + resolver solicitudes pendientes ─────────────
-- Reproduce por completo la versión vigente (20260811000002, timezone
-- America/Bogota) — mismas reglas de quién puede cancelar y la misma
-- ventana de 2 horas para PLAYER, sin ningún cambio. Único agregado: justo
-- después de que el UPDATE atómico confirma que la cancelación realmente
-- ocurrió, rechaza toda solicitud pendiente y notifica a cada solicitante
-- — misma transacción, así que si la cancelación no se aplica (ya estaba
-- resuelta), tampoco se toca ninguna solicitud.
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation   public.reservations;
  v_role          text;
  v_is_related    boolean;
  v_start_at      timestamptz;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Reservation is not in a cancellable state' USING ERRCODE = '22023';
  END IF;

  v_role := public.club_role(v_reservation.club_id);

  IF v_role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSIF v_role = 'PLAYER' THEN
    SELECT
      v_reservation.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.reservation_players
        WHERE reservation_id = p_reservation_id AND profile_id = auth.uid()
      )
    INTO v_is_related;

    IF NOT v_is_related THEN
      RAISE EXCEPTION 'Not authorized to cancel this reservation' USING ERRCODE = '42501';
    END IF;

    v_start_at := (v_reservation.date + v_reservation.start_time) AT TIME ZONE 'America/Bogota';

    IF v_start_at - now() < interval '2 hours' THEN
      RAISE EXCEPTION 'Cannot cancel within 2 hours of the reservation start time' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to cancel this reservation' USING ERRCODE = '42501';
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  WHERE id = p_reservation_id
    AND status IN ('pending', 'confirmed');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;

  PERFORM public._reject_pending_reservation_join_requests(
    p_reservation_id, 'La reserva fue cancelada.', auth.uid()
  );
END;
$$;


-- ─── 10. set_reservation_open_status ───────────────────────────────────────
-- Cambio manual de Abierta/Cerrada — creador, OWNER o ADMIN de una reserva
-- CONFIRMED (el estado Abierta/Cerrada no tiene sentido antes de que la
-- reserva exista como compromiso real). Abrir una reserva que ya tiene 4+
-- jugadores efectivos se rechaza (nunca podría aceptar una solicitud de
-- todos modos, approve_reservation_join_request lo re-valida igual). Cerrar
-- manualmente marca closed_reason = 'manual' (nunca se reabre sola) y
-- resuelve toda solicitud pendiente con el helper compartido.
CREATE OR REPLACE FUNCTION public.set_reservation_open_status(
  p_reservation_id uuid,
  p_is_open        boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation   public.reservations;
  v_role          text;
  v_count         integer;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed reservation can change its open/closed status' USING ERRCODE = '22023';
  END IF;

  v_role := public.effective_club_role(v_reservation.club_id);

  IF NOT (COALESCE(v_role, '') IN ('OWNER', 'ADMIN') OR v_reservation.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to change this reservation''s open/closed status' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_reservation.club_id);

  IF p_is_open THEN
    v_count := public._reservation_effective_player_count(p_reservation_id);
    IF v_count >= 4 THEN
      RAISE EXCEPTION 'This reservation already has the maximum number of players' USING ERRCODE = '22023';
    END IF;

    UPDATE public.reservations SET is_open = true, closed_reason = NULL
    WHERE id = p_reservation_id AND status = 'confirmed';
  ELSE
    UPDATE public.reservations SET is_open = false, closed_reason = 'manual'
    WHERE id = p_reservation_id AND status = 'confirmed';
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation was modified concurrently' USING ERRCODE = '22023';
  END IF;

  IF NOT p_is_open THEN
    PERFORM public._reject_pending_reservation_join_requests(
      p_reservation_id, 'La reserva dejó de aceptar jugadores.', auth.uid()
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_reservation_open_status(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_reservation_open_status(uuid, boolean) TO authenticated;


-- ─── 11. request_to_join_reservation ────────────────────────────────────────
-- Autoservicio PLAYER — individual, nunca por pareja. Revalida en el
-- servidor cada condición de la sección 3 del spec: autenticado (arriba),
-- membresía ACTIVA en el mismo club, no ser el creador, no ser ya
-- participante (incluye el fallback creador-sin-fila explícita), reserva
-- confirmed + is_open, y ninguna solicitud propia ya pendiente (el índice
-- único parcial es la garantía atómica final contra una carrera; el
-- EXISTS de abajo solo da un mensaje amigable en el caso común, no
-- concurrente). Notifica al creador + OWNER/ADMIN, misma transacción.
CREATE OR REPLACE FUNCTION public.request_to_join_reservation(p_reservation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation    public.reservations;
  v_role           text;
  v_already_player boolean;
  v_request_id     uuid;
  v_club_slug      text;
  v_court_name     text;
  v_requester_name text;
  v_date_label     text;
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

  IF v_reservation.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Cannot request to join your own reservation' USING ERRCODE = '22023';
  END IF;

  IF v_reservation.status <> 'confirmed' OR NOT v_reservation.is_open THEN
    RAISE EXCEPTION 'This reservation is not open for join requests' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reservation_players
    WHERE reservation_id = p_reservation_id AND profile_id = auth.uid()
  ) INTO v_already_player;
  IF v_already_player THEN
    RAISE EXCEPTION 'Already part of this reservation' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservation_join_requests
    WHERE reservation_id = p_reservation_id AND profile_id = auth.uid() AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending request already exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.reservation_join_requests (reservation_id, club_id, profile_id, status)
  VALUES (p_reservation_id, v_reservation.club_id, auth.uid(), 'pending')
  RETURNING id INTO v_request_id;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;
  SELECT name INTO v_court_name FROM public.courts WHERE id = v_reservation.court_id;
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = auth.uid();

  v_date_label := CASE
    WHEN v_reservation.date = current_date THEN 'hoy'
    WHEN v_reservation.date = current_date + 1 THEN 'mañana'
    ELSE to_char(v_reservation.date, 'DD/MM')
  END;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    recipient.profile_id,
    v_reservation.club_id,
    'reservation_join_request_created',
    'Nueva solicitud para unirse',
    COALESCE(v_requester_name, 'Un jugador') || ' quiere unirse a la reserva en ' ||
      COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
      to_char(v_reservation.start_time, 'HH24:MI') || '.',
    jsonb_build_object(
      'club_id', v_reservation.club_id,
      'club_slug', v_club_slug,
      'reservation_id', p_reservation_id,
      'join_request_id', v_request_id,
      'requester_profile_id', auth.uid(),
      'destination', '/' || v_club_slug || '/reservations/' || p_reservation_id
    )
  FROM (
    SELECT v_reservation.created_by AS profile_id
    UNION
    SELECT cm.profile_id FROM public.club_members cm
    WHERE cm.club_id = v_reservation.club_id AND cm.role IN ('OWNER', 'ADMIN') AND cm.is_active = true
  ) recipient;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_to_join_reservation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_to_join_reservation(uuid) TO authenticated;


-- ─── 12. approve_reservation_join_request ──────────────────────────────────
-- El punto crítico de concurrencia: SELECT ... FOR UPDATE sobre la fila de
-- reservations serializa cualquier aprobación simultánea para la misma
-- reserva, así que "dos personas aprueban al mismo tiempo con un solo cupo
-- libre" siempre deja a una sola ganadora (la segunda re-lee el conteo ya
-- actualizado después de esperar el lock y falla la validación de <4). Si
-- el creador es PLAYER y aún no tiene fila propia en reservation_players,
-- se inserta primero (ver comentario del encabezado) — así el jugador
-- solicitante nunca "reemplaza" al creador en la lista existente.
CREATE OR REPLACE FUNCTION public.approve_reservation_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_request        public.reservation_join_requests;
  v_reservation    public.reservations;
  v_role           text;
  v_creator_role   text;
  v_count          integer;
  v_new_count      integer;
  v_club_slug      text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM public.reservation_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE: bloquea la fila hasta el final de la transacción — toda
  -- aprobación concurrente sobre la MISMA reserva espera aquí.
  SELECT * INTO v_reservation FROM public.reservations WHERE id = v_request.reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.effective_club_role(v_reservation.club_id);
  IF NOT (COALESCE(v_role, '') IN ('OWNER', 'ADMIN') OR v_reservation.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to approve requests for this reservation' USING ERRCODE = '42501';
  END IF;

  -- Re-valida "sigue abierta" y "el jugador aún no pertenece" dentro del
  -- lock — nunca confía en el estado leído antes de tomarlo.
  IF v_reservation.status <> 'confirmed' OR NOT v_reservation.is_open THEN
    RAISE EXCEPTION 'This reservation no longer accepts join requests' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservation_players
    WHERE reservation_id = v_reservation.id AND profile_id = v_request.profile_id
  ) THEN
    RAISE EXCEPTION 'Player already part of this reservation' USING ERRCODE = '22023';
  END IF;

  v_count := public._reservation_effective_player_count(v_reservation.id);
  IF v_count >= 4 THEN
    RAISE EXCEPTION 'This reservation already has the maximum number of players' USING ERRCODE = '22023';
  END IF;

  -- Si el creador es PLAYER y todavía no está en reservation_players (caso
  -- normal: nunca hubo selector de jugadores en su propia creación), se
  -- inserta ahora — antes del nuevo jugador — para que deje de depender
  -- del fallback visual y la cuenta real quede completa desde este punto.
  SELECT cm.role INTO v_creator_role
  FROM public.club_members cm
  WHERE cm.club_id = v_reservation.club_id AND cm.profile_id = v_reservation.created_by;

  IF v_creator_role = 'PLAYER' THEN
    INSERT INTO public.reservation_players (reservation_id, profile_id)
    VALUES (v_reservation.id, v_reservation.created_by)
    ON CONFLICT (reservation_id, profile_id) DO NOTHING;
  END IF;

  INSERT INTO public.reservation_players (reservation_id, profile_id)
  VALUES (v_reservation.id, v_request.profile_id)
  ON CONFLICT (reservation_id, profile_id) DO NOTHING;

  UPDATE public.reservation_join_requests
  SET status = 'approved', resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_request_id;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    v_request.profile_id,
    v_reservation.club_id,
    'reservation_join_request_approved',
    'Solicitud aprobada',
    'Tu solicitud para unirte a la reserva fue aprobada.',
    jsonb_build_object(
      'club_id', v_reservation.club_id,
      'club_slug', v_club_slug,
      'reservation_id', v_reservation.id,
      'join_request_id', p_request_id,
      'destination', '/' || v_club_slug || '/reservations/' || v_reservation.id
    )
  );

  UPDATE public.notifications
  SET resolved_status = 'approved', resolved_at = now()
  WHERE type = 'reservation_join_request_created'
    AND (metadata->>'join_request_id')::uuid = p_request_id;

  -- Recalcula tras insertar — nunca asume v_count + 1 (defensivo ante
  -- cualquier fila ya presente por ON CONFLICT DO NOTHING).
  v_new_count := public._reservation_effective_player_count(v_reservation.id);

  IF v_new_count >= 4 THEN
    UPDATE public.reservations
    SET is_open = false, closed_reason = 'auto_full'
    WHERE id = v_reservation.id;

    PERFORM public._reject_pending_reservation_join_requests(
      v_reservation.id, 'La reserva ya se completó.', NULL
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_reservation_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_reservation_join_request(uuid) TO authenticated;


-- ─── 13. reject_reservation_join_request ───────────────────────────────────
-- Rechazo manual individual — creador, OWNER o ADMIN. Sin catálogo de
-- motivos (a diferencia del rechazo de una solicitud de reserva
-- pendiente): el spec no pide un selector de motivo para este flujo, así
-- que rejection_reason queda NULL aquí (solo los dos rechazos automáticos
-- del helper compartido llevan un motivo fijo del sistema).
CREATE OR REPLACE FUNCTION public.reject_reservation_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_request     public.reservation_join_requests;
  v_reservation public.reservations;
  v_role        text;
  v_club_slug   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM public.reservation_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = v_request.reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.effective_club_role(v_reservation.club_id);
  IF NOT (COALESCE(v_role, '') IN ('OWNER', 'ADMIN') OR v_reservation.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to reject requests for this reservation' USING ERRCODE = '42501';
  END IF;

  UPDATE public.reservation_join_requests
  SET status = 'rejected', resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_request_id AND status = 'pending';

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    v_request.profile_id,
    v_reservation.club_id,
    'reservation_join_request_rejected',
    'Solicitud rechazada',
    'Tu solicitud para unirte a la reserva fue rechazada.',
    jsonb_build_object(
      'club_id', v_reservation.club_id,
      'club_slug', v_club_slug,
      'reservation_id', v_reservation.id,
      'join_request_id', p_request_id,
      'destination', '/' || v_club_slug || '/reservations/' || v_reservation.id
    )
  );

  UPDATE public.notifications
  SET resolved_status = 'rejected', resolved_at = now()
  WHERE type = 'reservation_join_request_created'
    AND (metadata->>'join_request_id')::uuid = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_reservation_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_reservation_join_request(uuid) TO authenticated;


-- ─── 14. Reapertura automática — enganche en deactivate_player/leave_club ──
-- Reproduce el cuerpo actualmente desplegado de ambas funciones —
-- deactivate_player toma su versión más reciente (20261008000001, con
-- effective_club_role para el ejecutor — no la original 20260813000001)
-- y leave_club (sección 15 más abajo) su única versión (20260812000001) —
-- único agregado real en ambas: una llamada a _maybe_reopen_reservation
-- justo después de cada DELETE FROM reservation_players que sí borró una
-- fila, dentro del mismo LOOP que ya existía. Ninguna otra línea cambia.

CREATE OR REPLACE FUNCTION public.deactivate_player(p_club_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_executor_role        text;
  v_target                public.club_members;
  v_target_account_type   text;
  v_reservation_id        uuid;
  v_participant_row       RECORD;
  v_updated_count         int;
  v_player_name           text;
  v_club_name              text;
  v_club_slug              text;
  v_court_name             text;
  v_date_label             text;
  v_creator_role           text;
  v_destination            text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Reproduces the currently-deployed body (20261008000001,
  -- SUPERADMIN elevated access) exactly — effective_club_role, not the
  -- original club_role, is the authoritative check for this RPC today.
  v_executor_role := public.effective_club_role(p_club_id);
  IF v_executor_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to deactivate members of this club' USING ERRCODE = '42501';
  END IF;

  IF p_player_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot deactivate yourself' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.club_members
  WHERE club_id = p_club_id AND profile_id = p_player_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not an active member of this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_target.role != 'PLAYER' THEN
    RAISE EXCEPTION 'Only a PLAYER membership can be deactivated this way' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO v_target_account_type FROM public.profiles WHERE id = p_player_id;
  IF v_target_account_type IS DISTINCT FROM 'PLAYER' THEN
    RAISE EXCEPTION 'Target profile is not a PLAYER account' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = p_player_id;
  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;

  FOR v_reservation_id IN
    SELECT r.id FROM public.reservations r
    WHERE r.club_id = p_club_id
      AND r.created_by = p_player_id
      AND r.status IN ('pending', 'confirmed')
      AND r.type != 'block'
  LOOP
    UPDATE public.reservations
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
    WHERE id = v_reservation_id
      AND status IN ('pending', 'confirmed');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count > 0 THEN
      PERFORM public.notify_reservation_cancelled(v_reservation_id);
      PERFORM public._reject_pending_reservation_join_requests(
        v_reservation_id, 'La reserva fue cancelada.', auth.uid()
      );
    END IF;
  END LOOP;

  FOR v_participant_row IN
    SELECT r.id AS reservation_id, r.created_by AS creator_id, r.date, r.start_time,
           r.duration_minutes, r.court_id
    FROM public.reservations r
    JOIN public.reservation_players rp ON rp.reservation_id = r.id
    WHERE r.club_id = p_club_id
      AND rp.profile_id = p_player_id
      AND r.created_by != p_player_id
      AND r.status IN ('pending', 'confirmed')
      AND r.type != 'block'
      AND (r.date + r.start_time) AT TIME ZONE 'America/Bogota' > now()
  LOOP
    DELETE FROM public.reservation_players
    WHERE reservation_id = v_participant_row.reservation_id AND profile_id = p_player_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      CONTINUE;
    END IF;

    PERFORM public._maybe_reopen_reservation(v_participant_row.reservation_id);

    SELECT name INTO v_court_name FROM public.courts WHERE id = v_participant_row.court_id;
    v_date_label := CASE
      WHEN v_participant_row.date = current_date THEN 'hoy'
      WHEN v_participant_row.date = current_date + 1 THEN 'mañana'
      ELSE to_char(v_participant_row.date, 'DD/MM')
    END;

    SELECT role INTO v_creator_role
    FROM public.club_members
    WHERE club_id = p_club_id AND profile_id = v_participant_row.creator_id AND is_active = true;

    v_destination := CASE
      WHEN v_creator_role IN ('OWNER', 'ADMIN')
        THEN '/' || v_club_slug || '/admin/reservations/' || v_participant_row.reservation_id
      ELSE '/' || v_club_slug || '/reservations?reservationId=' || v_participant_row.reservation_id
    END;

    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    VALUES (
      v_participant_row.creator_id,
      p_club_id,
      'reservation_participant_left',
      'Un jugador dejó tu reserva',
      COALESCE(v_player_name, 'Un jugador') || ' ya no participará en tu reserva en ' ||
        COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_participant_row.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_participant_row.start_time + (v_participant_row.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
      jsonb_build_object(
        'club_id', p_club_id,
        'club_slug', v_club_slug,
        'reservation_id', v_participant_row.reservation_id,
        'former_participant_profile_id', p_player_id,
        'destination', v_destination
      )
    );
  END LOOP;

  UPDATE public.club_members
  SET is_active = false
  WHERE club_id = p_club_id AND profile_id = p_player_id AND is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Already deactivated' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    p_player_id,
    p_club_id,
    'player_deactivated',
    'Acceso desactivado',
    'Tu acceso a ' || COALESCE(v_club_name, 'el club') || ' fue desactivado por el club.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'destination', '/clubs'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_player(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_player(uuid, uuid) TO authenticated;


-- ─── 15. leave_club — same reopen hook ─────────────────────────────────────
-- Reproduces its one and only deployed version (20260812000001) in full,
-- unchanged except for the same _maybe_reopen_reservation call added to its
-- own participant-removal loop, plus the same join-request cleanup added to
-- its own self-cancellation loop (a player leaving the club who created an
-- open reservation must resolve its pending requests exactly like any other
-- cancellation does).
CREATE OR REPLACE FUNCTION public.leave_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_account_type     text;
  v_membership       public.club_members;
  v_reservation_id   uuid;
  v_participant_row  RECORD;
  v_updated_count    int;
  v_player_name      text;
  v_club_name        text;
  v_club_slug        text;
  v_court_name       text;
  v_date_label       text;
  v_creator_role     text;
  v_destination      text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IS DISTINCT FROM 'PLAYER' THEN
    RAISE EXCEPTION 'Only a PLAYER account can voluntarily leave a club' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_membership
  FROM public.club_members
  WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not an active member of this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_membership.role != 'PLAYER' THEN
    RAISE EXCEPTION 'OWNER/ADMIN memberships cannot use voluntary leave' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = auth.uid();
  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;

  FOR v_reservation_id IN
    SELECT r.id FROM public.reservations r
    WHERE r.club_id = p_club_id
      AND r.created_by = auth.uid()
      AND r.status IN ('pending', 'confirmed')
      AND r.type != 'block'
  LOOP
    UPDATE public.reservations
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
    WHERE id = v_reservation_id
      AND status IN ('pending', 'confirmed');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count > 0 THEN
      PERFORM public.notify_reservation_cancelled(v_reservation_id);
      PERFORM public._reject_pending_reservation_join_requests(
        v_reservation_id, 'La reserva fue cancelada.', auth.uid()
      );
    END IF;
  END LOOP;

  FOR v_participant_row IN
    SELECT r.id AS reservation_id, r.created_by AS creator_id, r.date, r.start_time,
           r.duration_minutes, r.court_id
    FROM public.reservations r
    JOIN public.reservation_players rp ON rp.reservation_id = r.id
    WHERE r.club_id = p_club_id
      AND rp.profile_id = auth.uid()
      AND r.created_by != auth.uid()
      AND r.status IN ('pending', 'confirmed')
      AND r.type != 'block'
      AND (r.date + r.start_time) AT TIME ZONE 'America/Bogota' > now()
  LOOP
    DELETE FROM public.reservation_players
    WHERE reservation_id = v_participant_row.reservation_id AND profile_id = auth.uid();

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      CONTINUE; -- already removed concurrently — nothing to notify
    END IF;

    PERFORM public._maybe_reopen_reservation(v_participant_row.reservation_id);

    SELECT name INTO v_court_name FROM public.courts WHERE id = v_participant_row.court_id;
    v_date_label := CASE
      WHEN v_participant_row.date = current_date THEN 'hoy'
      WHEN v_participant_row.date = current_date + 1 THEN 'mañana'
      ELSE to_char(v_participant_row.date, 'DD/MM')
    END;

    SELECT role INTO v_creator_role
    FROM public.club_members
    WHERE club_id = p_club_id AND profile_id = v_participant_row.creator_id AND is_active = true;

    v_destination := CASE
      WHEN v_creator_role IN ('OWNER', 'ADMIN')
        THEN '/' || v_club_slug || '/admin/reservations/' || v_participant_row.reservation_id
      ELSE '/' || v_club_slug || '/reservations?reservationId=' || v_participant_row.reservation_id
    END;

    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    VALUES (
      v_participant_row.creator_id,
      p_club_id,
      'reservation_participant_left',
      'Un jugador dejó tu reserva',
      COALESCE(v_player_name, 'Un jugador') || ' salió del club y ya no participará en tu reserva en ' ||
        COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_participant_row.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_participant_row.start_time + (v_participant_row.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
      jsonb_build_object(
        'club_id', p_club_id,
        'club_slug', v_club_slug,
        'reservation_id', v_participant_row.reservation_id,
        'former_participant_profile_id', auth.uid(),
        'destination', v_destination
      )
    );
  END LOOP;

  UPDATE public.club_members
  SET is_active = false
  WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Already left this club' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'player_left_club',
    'Un jugador salió del club',
    COALESCE(v_player_name, 'Un jugador') || ' salió de ' || COALESCE(v_club_name, 'tu club') || '.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'player_profile_id', auth.uid(),
      'destination', '/' || v_club_slug || '/admin/players'
    )
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_club(uuid) TO authenticated;


-- ─── 16. get_reservation_share_detail ───────────────────────────────────────
-- Única RPC de lectura para la página compartida (sección 5/6 del spec) —
-- agrupa todo en un solo round-trip en vez de exponer club_member_sport_
-- state/club_ranking_cycles (RLS-cerradas a todo rol cliente, ver Sport
-- Module Principles) a través de varias llamadas. Requiere membresía ACTIVA
-- en el club de la reserva — un visitante autenticado que no pertenece al
-- club recibe 42501 (la página lo traduce a "acceso restringido", nunca
-- expone nombres/categorías/participantes). Devuelve un jsonb único con
-- todo lo que la página necesita en una sola forma, incluida la propia
-- solicitud del visitante (si existe) y una advertencia de choque de
-- horario (sección 7) contra CUALQUIER otra reserva/participación propia
-- del visitante, en cualquier club — nunca solo el club de esta reserva,
-- porque el conflicto real es la agenda del jugador, no el club.
CREATE OR REPLACE FUNCTION public.get_reservation_share_detail(p_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
      'is_creator', v_reservation.created_by = auth.uid()
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
        -- UNION (not UNION ALL) already guarantees distinct profile_ids —
        -- the creator branch is only included via the NOT EXISTS guard
        -- when it isn't already a reservation_players row, so the two
        -- branches can never overlap by construction either.
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
