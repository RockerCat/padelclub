-- ============================================================
-- Court allocations & match scheduling
-- (Bloque 1.8, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Cuatro funciones SECURITY DEFINER: crear/actualizar/desactivar
-- asignaciones de cancha, y programar/reprogramar partidos dentro de
-- una asignación válida. Ninguna toca resultados, avance de ganadores,
-- puntos ni notificaciones.
--
-- Autorización: mismo patrón corregido y vigente citado en los
-- bloques anteriores (20260825000001) — membresía activa consultada
-- directamente, comparación positiva role IN ('OWNER','ADMIN'), nunca
-- club_role() NOT IN (...).
--
-- _require_club_not_archived (20260815000001) se reutiliza en las
-- funciones que crean un compromiso nuevo (crear/actualizar asignación,
-- programar partido) — nunca en desactivar, que solo resuelve algo
-- existente, mismo criterio ya aplicado en los bloques 1.5/1.6.
--
-- Conflicto contra reservas: misma semántica que create_reservation_
-- admin (20260815000001) — solo reservations.status = 'confirmed'
-- ocupa, sin filtrar por type (un 'block' ocupa igual que un 'match' o
-- 'class', mismo comportamiento ya documentado en
-- _check_reservation_conflict). 'pending'/'cancelled'/'rejected' nunca
-- bloquean una asignación ni una programación de torneo.
--
-- Conflicto entre tournament_matches: bloquean 'scheduled',
-- 'in_progress' y 'completed' (un partido ya jugado representa
-- ocupación real que sí ocurrió); 'cancelled' nunca bloquea, aunque
-- conserve su scheduling como historial.
--
-- ─── CORRECCIÓN aplicada antes de la primera ejecución real de este
-- archivo (sin tocar ninguna otra lógica del bloque) ─────────────────────
-- La versión anterior de este archivo usaba un dominio de lock propio
-- (hashtext('tournament_court_schedule:' || court_id || ':' || date)),
-- distinto del que ya usan las reservas
-- (public._lock_court_date(p_court_id, p_date), 20260814000001, que
-- internamente hace pg_advisory_xact_lock(hashtext(p_court_id::text ||
-- p_date::text)), sin prefijo). Dos dominios distintos nunca se
-- serializan entre sí en PostgreSQL, así que una reserva y una
-- asignación/programación de torneo sobre la misma cancha+fecha podían
-- ejecutarse en transacciones verdaderamente concurrentes sin bloquearse
-- mutuamente.
--
-- Corregido: las cuatro funciones de este archivo ahora llaman
-- directamente a public._lock_court_date(court_id, date) — el mismo
-- helper SECURITY DEFINER que ya usan create_reservation_player/
-- create_reservation_admin/update_reservation/approve_pending_
-- reservation. Se puede invocar tal cual, sin necesitar GRANT a
-- authenticated, exactamente igual que _require_club_not_archived ya se
-- reutiliza en este mismo archivo (un helper SECURITY DEFINER puede
-- llamar a otro sin necesitar permisos adicionales). No se creó ningún
-- helper nuevo, no se tocó _lock_court_date ni ninguna función de
-- reservas. Reserva, asignación de torneo y programación de partido
-- ahora comparten exactamente el mismo dominio de lock (court_id +
-- date) y se serializan entre sí sin excepción.
-- ============================================================


-- ─── create_tournament_court_allocation ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tournament_court_allocation(
  p_tournament_id      uuid,
  p_court_id           uuid,
  p_allocation_date    date,
  p_start_time         time,
  p_end_time           time
)
RETURNS TABLE (
  id               uuid,
  tournament_id    uuid,
  club_id          uuid,
  court_id         uuid,
  allocation_date  date,
  start_time       time,
  end_time         time,
  is_active        boolean,
  created_by       uuid,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_allocation     public.tournament_court_allocations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to manage court allocations for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to manage court allocations for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status NOT IN ('registration_closed', 'bracket_generated', 'in_progress') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows court allocations' USING ERRCODE = '22023';
  END IF;

  IF p_court_id IS NULL OR p_allocation_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'Court, date and time window are required' USING ERRCODE = '22023';
  END IF;

  IF NOT (p_end_time > p_start_time) THEN
    RAISE EXCEPTION 'end_time must be after start_time' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts AS c
    WHERE c.id = p_court_id AND c.club_id = v_tournament.club_id AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.starts_at IS NULL OR v_tournament.ends_at IS NULL THEN
    RAISE EXCEPTION 'Tournament schedule is not configured' USING ERRCODE = '22023';
  END IF;

  -- starts_at/ends_at son timestamptz — se convierten a fecha local
  -- explícitamente vía America/Bogota (misma convención ya usada en
  -- reservations, nunca un ::date directo dependiente del timezone de
  -- sesión).
  IF p_allocation_date < (v_tournament.starts_at AT TIME ZONE 'America/Bogota')::date
     OR p_allocation_date > (v_tournament.ends_at AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'Allocation date is outside the tournament dates' USING ERRCODE = '22023';
  END IF;

  PERFORM public._lock_court_date(p_court_id, p_allocation_date);

  IF EXISTS (
    SELECT 1 FROM public.tournament_court_allocations AS tca
    WHERE tca.court_id = p_court_id
      AND tca.allocation_date = p_allocation_date
      AND tca.is_active = true
      AND tca.start_time < p_end_time
      AND p_start_time < tca.end_time
  ) THEN
    RAISE EXCEPTION 'Court allocation overlaps another active allocation' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservations AS r
    WHERE r.court_id = p_court_id
      AND r.date = p_allocation_date
      AND r.status = 'confirmed'
      AND r.start_time < p_end_time
      AND p_start_time < (r.start_time + (r.duration_minutes || ' minutes')::interval)
  ) THEN
    RAISE EXCEPTION 'Court allocation overlaps an existing reservation' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tournament_court_allocations (
    tournament_id, club_id, court_id, allocation_date, start_time, end_time, created_by
  ) VALUES (
    p_tournament_id, v_tournament.club_id, p_court_id, p_allocation_date, p_start_time, p_end_time, auth.uid()
  )
  RETURNING * INTO v_allocation;

  RETURN QUERY SELECT (v_allocation).*;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament_court_allocation(uuid, uuid, date, time, time) FROM PUBLIC;


-- ─── update_tournament_court_allocation ─────────────────────────────────
-- No permite cambiar court_id/allocation_date mientras existan
-- partidos scheduled/in_progress/completed sobre esta asignación. La
-- ventana (start_time/end_time) puede ampliarse o reducirse solo si
-- todos esos partidos siguen contenidos dentro del nuevo rango.
CREATE OR REPLACE FUNCTION public.update_tournament_court_allocation(
  p_tournament_court_allocation_id  uuid,
  p_court_id                        uuid,
  p_allocation_date                 date,
  p_start_time                      time,
  p_end_time                        time
)
RETURNS TABLE (
  id               uuid,
  tournament_id    uuid,
  club_id          uuid,
  court_id         uuid,
  allocation_date  date,
  start_time       time,
  end_time         time,
  is_active        boolean,
  created_by       uuid,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_allocation     public.tournament_court_allocations%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_lock_key_old   text;
  v_lock_key_new   text;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT tca.tournament_id INTO v_tournament_id
  FROM public.tournament_court_allocations AS tca
  WHERE tca.id = p_tournament_court_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court allocation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = v_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_allocation
  FROM public.tournament_court_allocations AS tca
  WHERE tca.id = p_tournament_court_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court allocation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to manage court allocations for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to manage court allocations for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_allocation.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Court allocation is not active' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_closed', 'bracket_generated', 'in_progress') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows editing court allocations' USING ERRCODE = '22023';
  END IF;

  IF p_court_id IS NULL OR p_allocation_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'Court, date and time window are required' USING ERRCODE = '22023';
  END IF;

  IF NOT (p_end_time > p_start_time) THEN
    RAISE EXCEPTION 'end_time must be after start_time' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.tournament_court_allocation_id = p_tournament_court_allocation_id
      AND tm.status IN ('scheduled', 'in_progress', 'completed')
  ) THEN
    IF p_court_id <> v_allocation.court_id THEN
      RAISE EXCEPTION 'Cannot change the court while matches are scheduled on this allocation' USING ERRCODE = '22023';
    END IF;
    IF p_allocation_date <> v_allocation.allocation_date THEN
      RAISE EXCEPTION 'Cannot change the date while matches are scheduled on this allocation' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.tournament_court_allocation_id = p_tournament_court_allocation_id
      AND tm.status IN ('scheduled', 'in_progress', 'completed')
      AND (tm.scheduled_start_time < p_start_time OR tm.scheduled_end_time > p_end_time)
  ) THEN
    RAISE EXCEPTION 'The new window would leave an existing scheduled match outside the allocation' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts AS c
    WHERE c.id = p_court_id AND c.club_id = v_tournament.club_id AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.starts_at IS NULL OR v_tournament.ends_at IS NULL THEN
    RAISE EXCEPTION 'Tournament schedule is not configured' USING ERRCODE = '22023';
  END IF;

  IF p_allocation_date < (v_tournament.starts_at AT TIME ZONE 'America/Bogota')::date
     OR p_allocation_date > (v_tournament.ends_at AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'Allocation date is outside the tournament dates' USING ERRCODE = '22023';
  END IF;

  -- Orden determinístico por comparación de texto de la llave —
  -- nunca según cuál combinación es "la antigua" o "la nueva".
  -- v_lock_key_old/new son solo una representación textual estable para
  -- ORDENAR las dos combinaciones — el lock real siempre se adquiere vía
  -- public._lock_court_date(court_id, date), nunca vía hashtext directo.
  v_lock_key_old := v_allocation.court_id::text || ':' || v_allocation.allocation_date::text;
  v_lock_key_new := p_court_id::text || ':' || p_allocation_date::text;

  IF v_lock_key_old = v_lock_key_new THEN
    PERFORM public._lock_court_date(p_court_id, p_allocation_date);
  ELSIF v_lock_key_old < v_lock_key_new THEN
    PERFORM public._lock_court_date(v_allocation.court_id, v_allocation.allocation_date);
    PERFORM public._lock_court_date(p_court_id, p_allocation_date);
  ELSE
    PERFORM public._lock_court_date(p_court_id, p_allocation_date);
    PERFORM public._lock_court_date(v_allocation.court_id, v_allocation.allocation_date);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_court_allocations AS tca
    WHERE tca.court_id = p_court_id
      AND tca.allocation_date = p_allocation_date
      AND tca.is_active = true
      AND tca.id <> p_tournament_court_allocation_id
      AND tca.start_time < p_end_time
      AND p_start_time < tca.end_time
  ) THEN
    RAISE EXCEPTION 'Court allocation overlaps another active allocation' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservations AS r
    WHERE r.court_id = p_court_id
      AND r.date = p_allocation_date
      AND r.status = 'confirmed'
      AND r.start_time < p_end_time
      AND p_start_time < (r.start_time + (r.duration_minutes || ' minutes')::interval)
  ) THEN
    RAISE EXCEPTION 'Court allocation overlaps an existing reservation' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_court_allocations AS tca
  SET court_id = p_court_id,
      allocation_date = p_allocation_date,
      start_time = p_start_time,
      end_time = p_end_time
  WHERE tca.id = p_tournament_court_allocation_id AND tca.is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Court allocation was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_allocation
  FROM public.tournament_court_allocations AS tca
  WHERE tca.id = p_tournament_court_allocation_id;

  RETURN QUERY SELECT (v_allocation).*;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament_court_allocation(uuid, uuid, date, time, time) FROM PUBLIC;


-- ─── deactivate_tournament_court_allocation ─────────────────────────────
-- Nunca borra. Bloquea si existe cualquier match scheduled/in_progress/
-- completed/cancelled referenciándola — incluso cancelled, porque
-- tournament_matches permite que un partido cancelado conserve su
-- scheduling como historial, y esa asignación forma parte de esa
-- trazabilidad.
CREATE OR REPLACE FUNCTION public.deactivate_tournament_court_allocation(
  p_tournament_court_allocation_id uuid
)
RETURNS TABLE (
  id               uuid,
  tournament_id    uuid,
  club_id          uuid,
  court_id         uuid,
  allocation_date  date,
  start_time       time,
  end_time         time,
  is_active        boolean,
  created_by       uuid,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_allocation     public.tournament_court_allocations%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT tca.tournament_id INTO v_tournament_id
  FROM public.tournament_court_allocations AS tca
  WHERE tca.id = p_tournament_court_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court allocation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = v_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_allocation
  FROM public.tournament_court_allocations AS tca
  WHERE tca.id = p_tournament_court_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court allocation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to manage court allocations for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to manage court allocations for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_allocation.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Court allocation is already inactive' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.tournament_court_allocation_id = p_tournament_court_allocation_id
      AND tm.status IN ('scheduled', 'in_progress', 'completed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Court allocation has matches referencing it and cannot be deactivated' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_court_allocations AS tca
  SET is_active = false
  WHERE tca.id = p_tournament_court_allocation_id AND tca.is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Court allocation was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_allocation
  FROM public.tournament_court_allocations AS tca
  WHERE tca.id = p_tournament_court_allocation_id;

  RETURN QUERY SELECT (v_allocation).*;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_tournament_court_allocation(uuid) FROM PUBLIC;


-- ─── schedule_tournament_match ───────────────────────────────────────────
-- Sirve tanto para programar por primera vez (pending → scheduled)
-- como para reprogramar (scheduled → scheduled con nuevos datos) — una
-- sola función, sin un reschedule separado. court_id se copia siempre
-- desde la asignación; tournament_id/club_id se resuelven desde el
-- propio match, nunca recibidos como parámetro.
CREATE OR REPLACE FUNCTION public.schedule_tournament_match(
  p_tournament_match_id             uuid,
  p_tournament_court_allocation_id  uuid,
  p_scheduled_date                  date,
  p_scheduled_start_time             time,
  p_scheduled_end_time               time
)
RETURNS TABLE (
  id                              uuid,
  tournament_id                   uuid,
  club_id                         uuid,
  round_number                    integer,
  match_number                    integer,
  status                          text,
  source_match_one_id             uuid,
  source_match_two_id             uuid,
  entry_one_id                    uuid,
  entry_two_id                    uuid,
  tournament_court_allocation_id  uuid,
  court_id                        uuid,
  scheduled_date                  date,
  scheduled_start_time            time,
  scheduled_end_time              time,
  set_one_entry_one               smallint,
  set_one_entry_two               smallint,
  set_two_entry_one               smallint,
  set_two_entry_two               smallint,
  set_three_entry_one             smallint,
  set_three_entry_two             smallint,
  winner_entry_id                 uuid,
  started_at                      timestamptz,
  completed_at                    timestamptz,
  completed_by                    uuid,
  cancelled_at                    timestamptz,
  cancelled_by                    uuid,
  created_by                      uuid,
  updated_by                      uuid,
  created_at                      timestamptz,
  updated_at                      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_match          public.tournament_matches%ROWTYPE;
  v_allocation     public.tournament_court_allocations%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_lock_key_old   text;
  v_lock_key_new   text;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT tm.tournament_id INTO v_tournament_id
  FROM public.tournament_matches AS tm
  WHERE tm.id = p_tournament_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament match not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = v_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_match
  FROM public.tournament_matches AS tm
  WHERE tm.id = p_tournament_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament match not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to schedule matches for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to schedule matches for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status NOT IN ('bracket_generated', 'in_progress') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows scheduling matches' USING ERRCODE = '22023';
  END IF;

  IF v_match.status NOT IN ('pending', 'scheduled') THEN
    RAISE EXCEPTION 'Only a pending or scheduled match can be scheduled' USING ERRCODE = '22023';
  END IF;

  IF v_match.entry_one_id IS NULL OR v_match.entry_two_id IS NULL THEN
    RAISE EXCEPTION 'Match participants are not ready yet' USING ERRCODE = '22023';
  END IF;

  IF p_tournament_court_allocation_id IS NULL OR p_scheduled_date IS NULL
     OR p_scheduled_start_time IS NULL OR p_scheduled_end_time IS NULL THEN
    RAISE EXCEPTION 'Allocation, date and time window are required' USING ERRCODE = '22023';
  END IF;

  IF NOT (p_scheduled_end_time > p_scheduled_start_time) THEN
    RAISE EXCEPTION 'scheduled_end_time must be after scheduled_start_time' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_allocation
  FROM public.tournament_court_allocations AS tca
  WHERE tca.id = p_tournament_court_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court allocation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_allocation.tournament_id <> v_tournament_id THEN
    RAISE EXCEPTION 'Court allocation does not belong to this tournament' USING ERRCODE = '22023';
  END IF;

  IF v_allocation.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Court allocation is not active' USING ERRCODE = '22023';
  END IF;

  IF v_allocation.allocation_date <> p_scheduled_date THEN
    RAISE EXCEPTION 'Match date must match the allocation date' USING ERRCODE = '22023';
  END IF;

  IF p_scheduled_start_time < v_allocation.start_time OR p_scheduled_end_time > v_allocation.end_time THEN
    RAISE EXCEPTION 'Match schedule is outside the allocation window' USING ERRCODE = '22023';
  END IF;

  -- v_lock_key_old/new son solo una representación textual estable para
  -- ORDENAR las dos combinaciones — el lock real siempre se adquiere vía
  -- public._lock_court_date(court_id, date), nunca vía hashtext directo.
  v_lock_key_new := v_allocation.court_id::text || ':' || p_scheduled_date::text;

  -- Reprogramación: la combinación anterior también se bloquea, en
  -- orden determinístico junto con la nueva. Programación inicial: solo
  -- existe la combinación nueva.
  IF v_match.court_id IS NOT NULL AND v_match.scheduled_date IS NOT NULL THEN
    v_lock_key_old := v_match.court_id::text || ':' || v_match.scheduled_date::text;

    IF v_lock_key_old = v_lock_key_new THEN
      PERFORM public._lock_court_date(v_allocation.court_id, p_scheduled_date);
    ELSIF v_lock_key_old < v_lock_key_new THEN
      PERFORM public._lock_court_date(v_match.court_id, v_match.scheduled_date);
      PERFORM public._lock_court_date(v_allocation.court_id, p_scheduled_date);
    ELSE
      PERFORM public._lock_court_date(v_allocation.court_id, p_scheduled_date);
      PERFORM public._lock_court_date(v_match.court_id, v_match.scheduled_date);
    END IF;
  ELSE
    PERFORM public._lock_court_date(v_allocation.court_id, p_scheduled_date);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.court_id = v_allocation.court_id
      AND tm.scheduled_date = p_scheduled_date
      AND tm.status IN ('scheduled', 'in_progress', 'completed')
      AND tm.id <> p_tournament_match_id
      AND tm.scheduled_start_time < p_scheduled_end_time
      AND p_scheduled_start_time < tm.scheduled_end_time
  ) THEN
    RAISE EXCEPTION 'This time conflicts with another tournament match on the same court' USING ERRCODE = '22023';
  END IF;

  -- Datos frescos bajo el propio lock — no basta con que la asignación
  -- ya se validara contra reservas en su momento: una reserva pudo
  -- crearse después. Misma semántica de create_reservation_admin (solo
  -- confirmed).
  IF EXISTS (
    SELECT 1 FROM public.reservations AS r
    WHERE r.court_id = v_allocation.court_id
      AND r.date = p_scheduled_date
      AND r.status = 'confirmed'
      AND r.start_time < p_scheduled_end_time
      AND p_scheduled_start_time < (r.start_time + (r.duration_minutes || ' minutes')::interval)
  ) THEN
    RAISE EXCEPTION 'This time conflicts with an existing reservation' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_matches AS tm
  SET tournament_court_allocation_id = p_tournament_court_allocation_id,
      court_id = v_allocation.court_id,
      scheduled_date = p_scheduled_date,
      scheduled_start_time = p_scheduled_start_time,
      scheduled_end_time = p_scheduled_end_time,
      status = 'scheduled',
      updated_by = auth.uid()
  WHERE tm.id = p_tournament_match_id AND tm.status = v_match.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament match was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_match FROM public.tournament_matches AS tm WHERE tm.id = p_tournament_match_id;

  RETURN QUERY SELECT (v_match).*;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_tournament_match(uuid, uuid, date, time, time) FROM PUBLIC;
