-- ============================================================
-- Tournament match lifecycle — start / record / correct
-- (Bloque 1.9, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Tres funciones SECURITY DEFINER. La propagación del ganador y la
-- finalización del torneo ocurren dentro de record/correct — nunca
-- mediante una RPC pública separada. Ninguna toca puntos, ranking ni
-- notificaciones.
--
-- Autorización: mismo patrón corregido y vigente citado en todos los
-- bloques anteriores (20260825000001). Postura de este bloque: solo
-- OWNER/ADMIN activo registra o corrige resultados — no existe todavía
-- flujo de confirmación mutua entre jugadores, y una corrección puede
-- afectar el bracket, así que el MVP mantiene una única autoridad
-- operativa (mismo razonamiento ya usado para register/confirm/
-- withdraw_tournament_entry).
--
-- Validación deportiva del score: misma lógica exacta que el precedente
-- real record_match_result (20260831000002, retirado como tabla pero
-- vigente como patrón de validación) — 2 o 3 sets, ningún set empatado,
-- sin negativos, patrón 2-0/2-1 obligatorio, sin cuarto set. Adaptada de
-- arrays a las columnas fijas ya existentes en tournament_matches. Una
-- diferencia deliberada y más estricta que el precedente: aquí se exige
-- que el set 3 solo pueda existir cuando el marcador está 1-1 después de
-- los dos primeros sets — un "tercer set fantasma" sobre un partido ya
-- resuelto 2-0 se rechaza explícitamente, cosa que el precedente
-- retirado no comprobaba.
--
-- _require_club_not_archived NO se usa en estas tres funciones: iniciar,
-- registrar o corregir un partido no reclama un compromiso nuevo contra
-- el club (no toca cancha ni entradas) — es resolver algo que ya existe,
-- mismo criterio que exime a cancel_reservation/reject_pending_
-- reservation.
--
-- Concurrencia: sin advisory locks. El SELECT ... FOR UPDATE sobre la
-- fila del torneo, tomado al inicio de las tres funciones y mantenido
-- durante toda la transacción, ya serializa el ciclo de vida completo
-- del bracket — incluidas dos semifinales que alimentan la misma final,
-- ejecutadas en verdadera concurrencia: ambas bloquean primero el mismo
-- torneo, quedan serializadas entre sí, y cada una actualiza después un
-- slot distinto de la final con datos ya frescos.
--
-- Corrección de la final: rechazada sin excepción. Completar la final
-- ya cierra el torneo en la misma transacción de record (completed es
-- terminal, decisión ya cerrada en el diseño funcional — "no se
-- corrigen resultados después de completar el torneo"); reabrir su
-- resultado exigiría un modelo explícito de auditoría y reversión de
-- puntos que todavía no existe. correct_tournament_match_result nunca
-- acepta un match cuyo destination_count sea 0 (la propia definición de
-- "es la final").
--
-- completed_at/completed_by nunca se re-marcan en una corrección — son
-- el evento de finalización original, inmutable (misma decisión ya
-- aplicada a tournaments.completed_at frente a la cascada de
-- visibilidad). Solo updated_by (y updated_at, vía el trigger existente)
-- reflejan quién corrigió y cuándo. No existe corrected_at/corrected_by
-- y no se inventan aquí.
-- ============================================================


-- ─── start_tournament_match ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_tournament_match(
  p_tournament_match_id uuid
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
  v_caller_member  public.club_members%ROWTYPE;
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
    RAISE EXCEPTION 'Not authorized to start matches for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to start matches for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status NOT IN ('bracket_generated', 'in_progress') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows starting matches' USING ERRCODE = '22023';
  END IF;

  IF v_match.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Only a scheduled match can be started' USING ERRCODE = '22023';
  END IF;

  -- entry_one_id/entry_two_id/allocation/scheduling ya están garantizados
  -- NOT NULL por el propio CHECK de status='scheduled' de
  -- tournament_matches — no hace falta revalidarlos aquí.

  UPDATE public.tournament_matches AS tm
  SET status = 'in_progress', started_at = now(), updated_by = auth.uid()
  WHERE tm.id = p_tournament_match_id AND tm.status = 'scheduled';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament match was modified concurrently' USING ERRCODE = '22023';
  END IF;

  -- bracket_generated → in_progress con el primer partido iniciado;
  -- partidos posteriores encuentran el torneo ya in_progress (0 filas
  -- afectadas aquí, sin error — es el caso normal).
  IF v_tournament.status = 'bracket_generated' THEN
    UPDATE public.tournaments AS t
    SET status = 'in_progress'
    WHERE t.id = v_tournament_id AND t.status = 'bracket_generated';
  END IF;

  SELECT * INTO v_match FROM public.tournament_matches AS tm WHERE tm.id = p_tournament_match_id;

  RETURN QUERY SELECT (v_match).*;
END;
$$;

REVOKE ALL ON FUNCTION public.start_tournament_match(uuid) FROM PUBLIC;


-- ─── record_tournament_match_result ──────────────────────────────────────
-- Registra el resultado de un partido in_progress, calcula el ganador
-- exclusivamente desde el score (nunca recibido del cliente), lo
-- propaga al partido destino, y completa el torneo cuando corresponde
-- a la final y todos los partidos ya están completed — todo en una
-- sola transacción.
CREATE OR REPLACE FUNCTION public.record_tournament_match_result(
  p_tournament_match_id  uuid,
  p_set_one_entry_one    integer,
  p_set_one_entry_two    integer,
  p_set_two_entry_one    integer,
  p_set_two_entry_two    integer,
  p_set_three_entry_one  integer DEFAULT NULL,
  p_set_three_entry_two  integer DEFAULT NULL
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
  v_tournament_id      uuid;
  v_tournament         public.tournaments%ROWTYPE;
  v_match              public.tournament_matches%ROWTYPE;
  v_caller_member      public.club_members%ROWTYPE;
  v_entry_one_sets     int;
  v_entry_two_sets     int;
  v_winner_entry_id    uuid;
  v_destination        public.tournament_matches%ROWTYPE;
  v_destination_count  int;
  v_updated_count      int;
  v_total_matches      int;
  v_completed_matches  int;
  v_max_round          int;
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
    RAISE EXCEPTION 'Not authorized to record results for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to record results for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Tournament is not in progress' USING ERRCODE = '22023';
  END IF;

  IF v_match.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only an in-progress match can have its result recorded' USING ERRCODE = '22023';
  END IF;

  -- ── Validación deportiva del score ────────────────────────────────────
  IF p_set_one_entry_one IS NULL OR p_set_one_entry_two IS NULL
     OR p_set_two_entry_one IS NULL OR p_set_two_entry_two IS NULL THEN
    RAISE EXCEPTION 'Sets one and two are required' USING ERRCODE = '22023';
  END IF;

  IF p_set_one_entry_one < 0 OR p_set_one_entry_two < 0
     OR p_set_two_entry_one < 0 OR p_set_two_entry_two < 0
     OR COALESCE(p_set_three_entry_one, 0) < 0 OR COALESCE(p_set_three_entry_two, 0) < 0 THEN
    RAISE EXCEPTION 'Set scores cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_set_one_entry_one = p_set_one_entry_two THEN
    RAISE EXCEPTION 'Set one cannot end tied' USING ERRCODE = '22023';
  END IF;

  IF p_set_two_entry_one = p_set_two_entry_two THEN
    RAISE EXCEPTION 'Set two cannot end tied' USING ERRCODE = '22023';
  END IF;

  IF (p_set_three_entry_one IS NULL) <> (p_set_three_entry_two IS NULL) THEN
    RAISE EXCEPTION 'Set three must be fully provided or fully omitted' USING ERRCODE = '22023';
  END IF;

  IF p_set_three_entry_one IS NOT NULL AND p_set_three_entry_one = p_set_three_entry_two THEN
    RAISE EXCEPTION 'Set three cannot end tied' USING ERRCODE = '22023';
  END IF;

  v_entry_one_sets := 0;
  v_entry_two_sets := 0;

  IF p_set_one_entry_one > p_set_one_entry_two THEN
    v_entry_one_sets := v_entry_one_sets + 1;
  ELSE
    v_entry_two_sets := v_entry_two_sets + 1;
  END IF;

  IF p_set_two_entry_one > p_set_two_entry_two THEN
    v_entry_one_sets := v_entry_one_sets + 1;
  ELSE
    v_entry_two_sets := v_entry_two_sets + 1;
  END IF;

  IF p_set_three_entry_one IS NULL THEN
    IF v_entry_one_sets <> 2 AND v_entry_two_sets <> 2 THEN
      RAISE EXCEPTION 'A two-set match must be won 2-0' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_entry_one_sets <> 1 OR v_entry_two_sets <> 1 THEN
      RAISE EXCEPTION 'A third set is only valid when each entry won one of the first two sets' USING ERRCODE = '22023';
    END IF;
    IF p_set_three_entry_one > p_set_three_entry_two THEN
      v_entry_one_sets := v_entry_one_sets + 1;
    ELSE
      v_entry_two_sets := v_entry_two_sets + 1;
    END IF;
  END IF;

  IF v_entry_one_sets = 2 THEN
    v_winner_entry_id := v_match.entry_one_id;
  ELSIF v_entry_two_sets = 2 THEN
    v_winner_entry_id := v_match.entry_two_id;
  ELSE
    RAISE EXCEPTION 'The score does not produce a winner' USING ERRCODE = '22023';
  END IF;

  -- ── Registrar resultado ────────────────────────────────────────────────
  UPDATE public.tournament_matches AS tm
  SET set_one_entry_one = p_set_one_entry_one,
      set_one_entry_two = p_set_one_entry_two,
      set_two_entry_one = p_set_two_entry_one,
      set_two_entry_two = p_set_two_entry_two,
      set_three_entry_one = p_set_three_entry_one,
      set_three_entry_two = p_set_three_entry_two,
      winner_entry_id = v_winner_entry_id,
      status = 'completed',
      completed_at = now(),
      completed_by = auth.uid(),
      updated_by = auth.uid()
  WHERE tm.id = p_tournament_match_id AND tm.status = 'in_progress';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament match was modified concurrently' USING ERRCODE = '22023';
  END IF;

  -- ── Propagación al partido destino (o finalización del torneo) ────────
  SELECT count(*) INTO v_destination_count
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = v_tournament_id
    AND (tm.source_match_one_id = p_tournament_match_id OR tm.source_match_two_id = p_tournament_match_id);

  IF v_destination_count > 1 THEN
    RAISE EXCEPTION 'Match is referenced as a source by more than one destination' USING ERRCODE = '22023';
  END IF;

  IF v_destination_count = 1 THEN
    SELECT * INTO v_destination
    FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = v_tournament_id
      AND (tm.source_match_one_id = p_tournament_match_id OR tm.source_match_two_id = p_tournament_match_id)
    FOR UPDATE;

    IF v_destination.status <> 'pending' THEN
      RAISE EXCEPTION 'Destination match is not pending' USING ERRCODE = '22023';
    END IF;

    IF v_destination.winner_entry_id IS NOT NULL OR v_destination.started_at IS NOT NULL
       OR v_destination.completed_at IS NOT NULL OR v_destination.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'Destination match already has downstream activity' USING ERRCODE = '22023';
    END IF;

    IF v_destination.source_match_one_id = p_tournament_match_id THEN
      IF v_destination.entry_one_id IS NOT NULL THEN
        RAISE EXCEPTION 'Destination slot is already filled' USING ERRCODE = '22023';
      END IF;
      IF v_destination.entry_two_id = v_winner_entry_id THEN
        RAISE EXCEPTION 'Winner cannot duplicate the opposite participant' USING ERRCODE = '22023';
      END IF;

      UPDATE public.tournament_matches AS tm
      SET entry_one_id = v_winner_entry_id, updated_by = auth.uid()
      WHERE tm.id = v_destination.id AND tm.status = 'pending' AND tm.entry_one_id IS NULL;
    ELSE
      IF v_destination.entry_two_id IS NOT NULL THEN
        RAISE EXCEPTION 'Destination slot is already filled' USING ERRCODE = '22023';
      END IF;
      IF v_destination.entry_one_id = v_winner_entry_id THEN
        RAISE EXCEPTION 'Winner cannot duplicate the opposite participant' USING ERRCODE = '22023';
      END IF;

      UPDATE public.tournament_matches AS tm
      SET entry_two_id = v_winner_entry_id, updated_by = auth.uid()
      WHERE tm.id = v_destination.id AND tm.status = 'pending' AND tm.entry_two_id IS NULL;
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'Destination match was modified concurrently' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- destination_count = 0: este match es la final por definición.
    -- Verificación defensiva de que corresponde a la ronda máxima, y de
    -- que absolutamente todos los partidos del torneo ya están
    -- completed antes de cerrar el torneo.
    SELECT max(tm.round_number) INTO v_max_round
    FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = v_tournament_id;

    IF v_match.round_number <> v_max_round THEN
      RAISE EXCEPTION 'A match without a destination must be the final' USING ERRCODE = '22023';
    END IF;

    SELECT count(*), count(*) FILTER (WHERE tm.status = 'completed')
    INTO v_total_matches, v_completed_matches
    FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = v_tournament_id;

    IF v_completed_matches <> v_total_matches THEN
      RAISE EXCEPTION 'Tournament cannot be completed while other matches remain unfinished' USING ERRCODE = '22023';
    END IF;

    UPDATE public.tournaments AS t
    SET status = 'completed', completed_at = now(), completed_by = auth.uid()
    WHERE t.id = v_tournament_id AND t.status = 'in_progress';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_match FROM public.tournament_matches AS tm WHERE tm.id = p_tournament_match_id;

  RETURN QUERY SELECT (v_match).*;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tournament_match_result(
  uuid, integer, integer, integer, integer, integer, integer
) FROM PUBLIC;


-- ─── correct_tournament_match_result ─────────────────────────────────────
-- Solo partidos completed que NO sean la final (destination_count = 1),
-- y solo mientras el partido destino siga pending sin ninguna actividad
-- posterior. La final nunca se corrige aquí — completarla ya cerró el
-- torneo, terminal sin excepción.
CREATE OR REPLACE FUNCTION public.correct_tournament_match_result(
  p_tournament_match_id  uuid,
  p_set_one_entry_one    integer,
  p_set_one_entry_two    integer,
  p_set_two_entry_one    integer,
  p_set_two_entry_two    integer,
  p_set_three_entry_one  integer DEFAULT NULL,
  p_set_three_entry_two  integer DEFAULT NULL
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
  v_tournament_id       uuid;
  v_tournament          public.tournaments%ROWTYPE;
  v_match               public.tournament_matches%ROWTYPE;
  v_caller_member       public.club_members%ROWTYPE;
  v_entry_one_sets      int;
  v_entry_two_sets      int;
  v_new_winner_entry_id uuid;
  v_destination         public.tournament_matches%ROWTYPE;
  v_destination_count   int;
  v_updated_count       int;
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
    RAISE EXCEPTION 'Not authorized to correct results for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to correct results for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'Only a completed match can be corrected' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_destination_count
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = v_tournament_id
    AND (tm.source_match_one_id = p_tournament_match_id OR tm.source_match_two_id = p_tournament_match_id);

  IF v_destination_count > 1 THEN
    RAISE EXCEPTION 'Match is referenced as a source by more than one destination' USING ERRCODE = '22023';
  END IF;

  -- La final (sin destino) nunca se corrige: completarla ya cerró el
  -- torneo en la misma transacción de record — completed es terminal,
  -- sin excepción, decisión ya cerrada en el diseño funcional.
  IF v_destination_count = 0 THEN
    RAISE EXCEPTION 'The final result cannot be corrected once the tournament is completed' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Tournament is not in progress' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_destination
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = v_tournament_id
    AND (tm.source_match_one_id = p_tournament_match_id OR tm.source_match_two_id = p_tournament_match_id)
  FOR UPDATE;

  IF v_destination.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot correct a result once the destination match has been scheduled or started' USING ERRCODE = '22023';
  END IF;

  IF v_destination.winner_entry_id IS NOT NULL OR v_destination.started_at IS NOT NULL
     OR v_destination.completed_at IS NOT NULL OR v_destination.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot correct a result once the destination match has downstream activity' USING ERRCODE = '22023';
  END IF;

  -- ── Misma validación deportiva que record_tournament_match_result ─────
  IF p_set_one_entry_one IS NULL OR p_set_one_entry_two IS NULL
     OR p_set_two_entry_one IS NULL OR p_set_two_entry_two IS NULL THEN
    RAISE EXCEPTION 'Sets one and two are required' USING ERRCODE = '22023';
  END IF;

  IF p_set_one_entry_one < 0 OR p_set_one_entry_two < 0
     OR p_set_two_entry_one < 0 OR p_set_two_entry_two < 0
     OR COALESCE(p_set_three_entry_one, 0) < 0 OR COALESCE(p_set_three_entry_two, 0) < 0 THEN
    RAISE EXCEPTION 'Set scores cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_set_one_entry_one = p_set_one_entry_two THEN
    RAISE EXCEPTION 'Set one cannot end tied' USING ERRCODE = '22023';
  END IF;

  IF p_set_two_entry_one = p_set_two_entry_two THEN
    RAISE EXCEPTION 'Set two cannot end tied' USING ERRCODE = '22023';
  END IF;

  IF (p_set_three_entry_one IS NULL) <> (p_set_three_entry_two IS NULL) THEN
    RAISE EXCEPTION 'Set three must be fully provided or fully omitted' USING ERRCODE = '22023';
  END IF;

  IF p_set_three_entry_one IS NOT NULL AND p_set_three_entry_one = p_set_three_entry_two THEN
    RAISE EXCEPTION 'Set three cannot end tied' USING ERRCODE = '22023';
  END IF;

  v_entry_one_sets := 0;
  v_entry_two_sets := 0;

  IF p_set_one_entry_one > p_set_one_entry_two THEN
    v_entry_one_sets := v_entry_one_sets + 1;
  ELSE
    v_entry_two_sets := v_entry_two_sets + 1;
  END IF;

  IF p_set_two_entry_one > p_set_two_entry_two THEN
    v_entry_one_sets := v_entry_one_sets + 1;
  ELSE
    v_entry_two_sets := v_entry_two_sets + 1;
  END IF;

  IF p_set_three_entry_one IS NULL THEN
    IF v_entry_one_sets <> 2 AND v_entry_two_sets <> 2 THEN
      RAISE EXCEPTION 'A two-set match must be won 2-0' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_entry_one_sets <> 1 OR v_entry_two_sets <> 1 THEN
      RAISE EXCEPTION 'A third set is only valid when each entry won one of the first two sets' USING ERRCODE = '22023';
    END IF;
    IF p_set_three_entry_one > p_set_three_entry_two THEN
      v_entry_one_sets := v_entry_one_sets + 1;
    ELSE
      v_entry_two_sets := v_entry_two_sets + 1;
    END IF;
  END IF;

  IF v_entry_one_sets = 2 THEN
    v_new_winner_entry_id := v_match.entry_one_id;
  ELSIF v_entry_two_sets = 2 THEN
    v_new_winner_entry_id := v_match.entry_two_id;
  ELSE
    RAISE EXCEPTION 'The score does not produce a winner' USING ERRCODE = '22023';
  END IF;

  -- ── Sustitución del slot aguas abajo, solo si el ganador cambia ────────
  IF v_new_winner_entry_id <> v_match.winner_entry_id THEN
    IF v_destination.source_match_one_id = p_tournament_match_id THEN
      IF v_destination.entry_one_id IS DISTINCT FROM v_match.winner_entry_id THEN
        RAISE EXCEPTION 'Destination slot does not match the expected previous winner' USING ERRCODE = '22023';
      END IF;

      UPDATE public.tournament_matches AS tm
      SET entry_one_id = v_new_winner_entry_id, updated_by = auth.uid()
      WHERE tm.id = v_destination.id AND tm.status = 'pending';
    ELSE
      IF v_destination.entry_two_id IS DISTINCT FROM v_match.winner_entry_id THEN
        RAISE EXCEPTION 'Destination slot does not match the expected previous winner' USING ERRCODE = '22023';
      END IF;

      UPDATE public.tournament_matches AS tm
      SET entry_two_id = v_new_winner_entry_id, updated_by = auth.uid()
      WHERE tm.id = v_destination.id AND tm.status = 'pending';
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'Destination match was modified concurrently' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- completed_at/completed_by nunca se re-marcan — solo updated_by.
  UPDATE public.tournament_matches AS tm
  SET set_one_entry_one = p_set_one_entry_one,
      set_one_entry_two = p_set_one_entry_two,
      set_two_entry_one = p_set_two_entry_one,
      set_two_entry_two = p_set_two_entry_two,
      set_three_entry_one = p_set_three_entry_one,
      set_three_entry_two = p_set_three_entry_two,
      winner_entry_id = v_new_winner_entry_id,
      updated_by = auth.uid()
  WHERE tm.id = p_tournament_match_id AND tm.status = 'completed';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament match was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_match FROM public.tournament_matches AS tm WHERE tm.id = p_tournament_match_id;

  RETURN QUERY SELECT (v_match).*;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_tournament_match_result(
  uuid, integer, integer, integer, integer, integer, integer
) FROM PUBLIC;
