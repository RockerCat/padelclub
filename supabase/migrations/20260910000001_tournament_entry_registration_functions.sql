-- ============================================================
-- Tournament entry registration cycle — register/confirm/withdraw
-- (Bloque 1.6, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Tres funciones SECURITY DEFINER sobre tournament_entries y
-- tournament_entry_members únicamente. Ninguna toca allocations,
-- matches, el ledger de puntos ni notificaciones.
--
-- Autorización: mismo patrón corregido y vigente citado en
-- 20260909000001 (20260825000001_fix_sport_state_authorization_bypass)
-- — membresía ACTIVA consultada directamente en club_members, `IF NOT
-- FOUND` explícito, comparación POSITIVA (`role IN (...)`), nunca
-- `club_role() NOT IN (...)`. Mismas 20 columnas de tournaments no
-- aplican aquí; en su lugar, RETURNS TABLE usa las 12 columnas reales
-- de tournament_entries en su orden real, con alias explícitos en cada
-- consulta para que nombres comunes (`id`, `status`, `category`) nunca
-- colisionen en silencio con la salida de la función.
--
-- Advisory locks: precedente real ya establecido — club_pricing_rules
-- (`hashtext('club_pricing_rules:' || ...)`), sport_provisioning
-- (`hashtext(p_club_id::text || ':' || p_category)`), record_match_
-- result_rpc (`hashtext('match_result:' || ...)`) — todos con un
-- prefijo de dominio como texto concatenado dentro de un único
-- hashtext(), usando siempre pg_advisory_xact_lock(bigint) de un solo
-- argumento. Se reutiliza exactamente ese patrón con el prefijo fijo
-- 'tournament_entry:' — es la estrategia centralizada y estable que
-- evita colisionar con el dominio de _lock_court_date (cancha+fecha),
-- sin necesitar ningún helper nuevo.
--
-- Orden determinístico de los dos jugadores: siempre por comparación
-- de uuid (< es un orden total bien definido en PostgreSQL), nunca por
-- el orden en que el cliente los envió — así dos llamadas concurrentes
-- que comparten un jugador siempre intentan adquirir ese mismo lock en
-- la misma posición relativa, haciendo estructuralmente imposible un
-- ciclo de espera.
--
-- Orden global de locks: fila de tournaments (FOR UPDATE) → fila de
-- tournament_entries (FOR UPDATE, si ya existe) → advisory locks de
-- jugadores en orden determinístico → consultas de conflicto/capacidad
-- → escritura. Mismo orden en las tres funciones.
--
-- Política pending/confirmed (auditada, no inferida en silencio): no
-- existe ninguna decisión previa que ate esto a tournaments.visibility
-- — visibility solo gobierna quién puede VER el torneo, nunca la
-- aprobación de inscripciones (ese flujo de aprobación fue explícitamente
-- diferido en rondas de diseño anteriores). La política ratificada aquí
-- es una analogía directa con un precedente real ya existente en este
-- mismo esquema: create_reservation_player crea siempre 'pending'
-- (requiere aprobación posterior), create_reservation_admin crea
-- siempre 'confirmed' directamente (sin paso de aprobación). Se aplica
-- la misma regla: inscripción creada por un PLAYER → 'pending';
-- inscripción creada por OWNER/ADMIN → 'confirmed' directamente.
--
-- Sin GRANT a authenticated en esta iteración (instrucción explícita).
-- ============================================================


-- ─── register_tournament_entry ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_tournament_entry(
  p_tournament_id       uuid,
  p_club_member_one_id  uuid,
  p_club_member_two_id  uuid
)
RETURNS TABLE (
  id             uuid,
  tournament_id  uuid,
  club_id        uuid,
  category       text,
  status         text,
  confirmed_at   timestamptz,
  confirmed_by   uuid,
  withdrawn_at   timestamptz,
  withdrawn_by   uuid,
  created_by     uuid,
  created_at     timestamptz,
  updated_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_one     public.club_members%ROWTYPE;
  v_member_two     public.club_members%ROWTYPE;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_conflict_count int;
  v_entry_count    int;
  v_entry          public.tournament_entries%ROWTYPE;
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

  IF v_tournament.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Tournament registration is not open' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.registration_opens_at > now() THEN
    RAISE EXCEPTION 'Tournament registration has not opened yet' USING ERRCODE = '22023';
  END IF;

  IF NOT (now() < v_tournament.registration_closes_at) THEN
    RAISE EXCEPTION 'Tournament registration window has closed' USING ERRCODE = '22023';
  END IF;

  -- Guarda de nulidad/distinción ANTES de cualquier comparación con
  -- p_club_member_one_id/p_club_member_two_id: si se dejara para más
  -- adelante, una comparación como `v_caller_member.id <> p_club_member_
  -- one_id` con un parámetro NULL evaluaría a NULL, y un `IF NULL THEN`
  -- se trata como falso en plpgsql — exactamente la misma clase de fuga
  -- de autorización que 20260825000001 corrigió, aplicada aquí a un
  -- parámetro en vez de a un rol.
  IF p_club_member_one_id IS NULL OR p_club_member_two_id IS NULL THEN
    RAISE EXCEPTION 'Both players are required' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id = p_club_member_two_id THEN
    RAISE EXCEPTION 'The two players must be different' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> p_club_member_one_id AND v_caller_member.id <> p_club_member_two_id THEN
      RAISE EXCEPTION 'A player can only register a pair they are part of' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member_one
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_one_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player one is not a member of this club' USING ERRCODE = '22023';
  END IF;
  IF v_member_one.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Player one does not have an active membership' USING ERRCODE = '22023';
  END IF;
  IF v_member_one.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can register for a tournament' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member_two
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_two_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player two is not a member of this club' USING ERRCODE = '22023';
  END IF;
  IF v_member_two.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Player two does not have an active membership' USING ERRCODE = '22023';
  END IF;
  IF v_member_two.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can register for a tournament' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id < p_club_member_two_id THEN
    v_lock_first := p_club_member_one_id;
    v_lock_second := p_club_member_two_id;
  ELSE
    v_lock_first := p_club_member_two_id;
    v_lock_second := p_club_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = p_tournament_id
    AND tem.club_member_id IN (p_club_member_one_id, p_club_member_two_id)
    AND te.status IN ('pending', 'confirmed');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_entry_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id
    AND te.status IN ('pending', 'confirmed');

  IF v_entry_count >= v_tournament.bracket_size THEN
    RAISE EXCEPTION 'Tournament has reached its bracket size' USING ERRCODE = '22023';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, status, confirmed_at, confirmed_by, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, 'confirmed', now(), auth.uid(), auth.uid()
    )
    RETURNING * INTO v_entry;
  ELSE
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, status, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, 'pending', auth.uid()
    )
    RETURNING * INTO v_entry;
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_one_id),
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_two_id);

  RETURN QUERY SELECT (v_entry).*;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) FROM PUBLIC;


-- ─── confirm_tournament_entry ────────────────────────────────────────────
-- Solo OWNER/ADMIN. Solo desde 'pending'. No toca members, created_by
-- ni withdrawn_*. Capacidad y conflicto se revalidan de forma
-- defensiva aunque la entry ya contaba como cupo desde su creación.
CREATE OR REPLACE FUNCTION public.confirm_tournament_entry(
  p_tournament_entry_id uuid
)
RETURNS TABLE (
  id             uuid,
  tournament_id  uuid,
  club_id        uuid,
  category       text,
  status         text,
  confirmed_at   timestamptz,
  confirmed_by   uuid,
  withdrawn_at   timestamptz,
  withdrawn_by   uuid,
  created_by     uuid,
  created_at     timestamptz,
  updated_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_entry          public.tournament_entries%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_ids     uuid[];
  v_member_one_id  uuid;
  v_member_two_id  uuid;
  v_member_one     public.club_members%ROWTYPE;
  v_member_two     public.club_members%ROWTYPE;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_conflict_count int;
  v_entry_count    int;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT te.tournament_id INTO v_tournament_id
  FROM public.tournament_entries AS te
  WHERE te.id = p_tournament_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = v_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entry
  FROM public.tournament_entries AS te
  WHERE te.id = p_tournament_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to confirm this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to confirm this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending entry can be confirmed' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Tournament registration is not open' USING ERRCODE = '22023';
  END IF;

  IF NOT (now() < v_tournament.registration_closes_at) THEN
    RAISE EXCEPTION 'Tournament registration window has closed' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(tem.club_member_id) INTO v_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id;

  IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two members' USING ERRCODE = '22023';
  END IF;

  v_member_one_id := v_member_ids[1];
  v_member_two_id := v_member_ids[2];

  SELECT * INTO v_member_one
  FROM public.club_members AS cm
  WHERE cm.id = v_member_one_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND OR v_member_one.is_active IS NOT TRUE OR v_member_one.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player one is no longer an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member_two
  FROM public.club_members AS cm
  WHERE cm.id = v_member_two_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND OR v_member_two.is_active IS NOT TRUE OR v_member_two.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player two is no longer an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  IF v_member_one_id < v_member_two_id THEN
    v_lock_first := v_member_one_id;
    v_lock_second := v_member_two_id;
  ELSE
    v_lock_first := v_member_two_id;
    v_lock_second := v_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = v_tournament_id
    AND tem.club_member_id IN (v_member_one_id, v_member_two_id)
    AND te.status IN ('pending', 'confirmed')
    AND te.id <> p_tournament_entry_id;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has another active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_entry_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = v_tournament_id
    AND te.status IN ('pending', 'confirmed');

  IF v_entry_count > v_tournament.bracket_size THEN
    RAISE EXCEPTION 'Tournament has exceeded its bracket size' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
  WHERE te.id = p_tournament_entry_id AND te.status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament entry was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT (v_entry).*;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_tournament_entry(uuid) FROM PUBLIC;


-- ─── withdraw_tournament_entry ───────────────────────────────────────────
-- Desde 'pending' o 'confirmed' únicamente. OWNER/ADMIN retira cualquier
-- entry de su club; un PLAYER solo la suya propia. Nunca borra members,
-- nunca limpia confirmed_*/created_by — el historial completo queda
-- conservado.
CREATE OR REPLACE FUNCTION public.withdraw_tournament_entry(
  p_tournament_entry_id uuid
)
RETURNS TABLE (
  id             uuid,
  tournament_id  uuid,
  club_id        uuid,
  category       text,
  status         text,
  confirmed_at   timestamptz,
  confirmed_by   uuid,
  withdrawn_at   timestamptz,
  withdrawn_by   uuid,
  created_by     uuid,
  created_at     timestamptz,
  updated_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_entry          public.tournament_entries%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_ids     uuid[];
  v_member_one_id  uuid;
  v_member_two_id  uuid;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT te.tournament_id INTO v_tournament_id
  FROM public.tournament_entries AS te
  WHERE te.id = p_tournament_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = v_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entry
  FROM public.tournament_entries AS te
  WHERE te.id = p_tournament_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(tem.club_member_id) INTO v_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id;

  IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two members' USING ERRCODE = '22023';
  END IF;

  v_member_one_id := v_member_ids[1];
  v_member_two_id := v_member_ids[2];

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to withdraw this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> v_member_one_id AND v_caller_member.id <> v_member_two_id THEN
      RAISE EXCEPTION 'A player can only withdraw an entry they are part of' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to withdraw this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Only a pending or confirmed entry can be withdrawn' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows withdrawal' USING ERRCODE = '22023';
  END IF;

  IF v_member_one_id < v_member_two_id THEN
    v_lock_first := v_member_one_id;
    v_lock_second := v_member_two_id;
  ELSE
    v_lock_first := v_member_two_id;
    v_lock_second := v_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_second::text));

  UPDATE public.tournament_entries AS te
  SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid()
  WHERE te.id = p_tournament_entry_id AND te.status = v_entry.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament entry was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT (v_entry).*;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_tournament_entry(uuid) FROM PUBLIC;
