-- ============================================================
-- Tournament points — liquidación deportiva idempotente
-- (Bloque 1.10, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Una sola función SECURITY DEFINER. Otorga los cuatro eventos de
-- puntos de torneo (participación, campeón, subcampeón, semifinalista)
-- sobre un torneo completed, de forma atómica e idempotente. No crea
-- notificaciones, no recalcula categoría, no toca tournaments ni el
-- bracket.
--
-- Valores definitivos del MVP (aprobados explícitamente, codificados
-- como constantes dentro de la función, nunca recibidos del cliente):
--   tournament_participation   → 5
--   tournament_champion        → 30 adicionales
--   tournament_runner_up       → 15 adicionales
--   tournament_semifinalist    → 5 adicionales
-- Acumulativos: un campeón recibe participación + campeón; nunca
-- runner_up ni semifinalist. Mismos valores para bracket_size 4/8/16.
--
-- Autorización: mismo patrón corregido y vigente citado en todos los
-- bloques anteriores (20260825000001).
--
-- Sin _require_club_not_archived: liquidar puntos de un torneo ya
-- completed no reclama un compromiso nuevo contra el club — mismo
-- criterio ya aplicado a start/record/correct_tournament_match_result.
--
-- No se reutiliza adjust_club_player_points: esa función es
-- exclusivamente origin='manual', con su propio catálogo fijo de 6
-- reason_code — no aplica a un evento de sistema. El precedente real
-- para origin='system' es la lógica inline ya usada por
-- change_club_player_category para su movimiento técnico de cierre de
-- ciclo (bloquear club_member_sport_state, calcular previous_total/
-- new_total, actualizar current_points, insertar el movimiento) —
-- replicada aquí, sin ningún helper nuevo.
--
-- Concurrencia: tournaments FOR UPDATE (no reclama nada nuevo del
-- torneo, pero serializa dos liquidaciones simultáneas del mismo
-- torneo). club_member_sport_state se bloquea FOR UPDATE una fila a la
-- vez, en orden determinístico ascendente por club_member_id — no se
-- inventa un dominio de advisory lock nuevo: ninguna otra función toca
-- más de un jugador a la vez, así que el orden determinístico de los
-- row locks ya existentes es suficiente y consistente con el único
-- precedente real (adjust_club_player_points, un jugador por llamada).
--
-- Categoría/cycle_id de cada movimiento: siempre desde el
-- club_member_sport_state VIGENTE del jugador en el momento de
-- liquidar — nunca desde tournaments.category ni tournament_entries.
-- category (ambas históricas, la competencia disputada, no el estado
-- deportivo actual). tournament_entries.category no se toca.
--
-- Sin cambio de categoría: ningún mecanismo existente en el proyecto
-- dispara automáticamente un cambio de categoría a partir de puntos
-- (change_club_player_category es siempre una acción manual separada,
-- nunca invocada por adjust_club_player_points ni por ningún otro
-- camino) — esta función no inventa ese automatismo.
--
-- Idempotencia: clave lógica (tournament_id, club_member_id,
-- system_event_code). Antes de escribir, se cuenta cuántos movimientos
-- de este torneo ya existen, desglosados por system_event_code. Cero
-- → procede. Exactamente el conjunto completo esperado (participación
-- = bracket_size × 2, campeón = 2, runner_up = 2, semifinalista = 4) →
-- already_awarded = true, sin tocar puntos. Cualquier otro conteo →
-- RAISE EXCEPTION como inconsistencia — nunca completa lo que falta,
-- nunca repara.
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_tournament_points(
  p_tournament_id uuid
)
RETURNS TABLE (
  tournament_id             uuid,
  participation_movements   integer,
  champion_movements        integer,
  runner_up_movements       integer,
  semifinalist_movements    integer,
  total_movements           integer,
  already_awarded           boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament                public.tournaments%ROWTYPE;
  v_caller_member             public.club_members%ROWTYPE;
  v_confirmed_entry_ids       uuid[];
  v_round1_entry_ids          uuid[];
  v_bad_count                 int;
  v_total_matches             int;
  v_completed_matches         int;
  v_max_round                 int;
  v_final                     public.tournament_matches%ROWTYPE;
  v_semifinal_one             public.tournament_matches%ROWTYPE;
  v_semifinal_two             public.tournament_matches%ROWTYPE;
  v_champion_entry_id         uuid;
  v_runner_up_entry_id        uuid;
  v_semifinalist_one_entry_id uuid;
  v_semifinalist_two_entry_id uuid;
  v_participation_member_ids  uuid[];
  v_champion_member_ids       uuid[];
  v_runner_up_member_ids      uuid[];
  v_semifinalist_member_ids   uuid[];
  v_expected_total            int;
  v_participation_count       int;
  v_champion_count            int;
  v_runner_up_count           int;
  v_semifinalist_count        int;
  v_total_count               int;
  v_already_awarded           boolean := false;
  v_member_id                 uuid;
  v_state                     public.club_member_sport_state%ROWTYPE;
  v_category                  text;
  v_new_total                 integer;
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
    RAISE EXCEPTION 'Not authorized to award points for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to award points for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status <> 'completed' THEN
    RAISE EXCEPTION 'Tournament is not completed' USING ERRCODE = '22023';
  END IF;

  -- ── Integridad del bracket completado ──────────────────────────────────
  SELECT count(*), count(*) FILTER (WHERE tm.status = 'completed')
  INTO v_total_matches, v_completed_matches
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = p_tournament_id;

  IF v_total_matches <> v_tournament.bracket_size - 1 THEN
    RAISE EXCEPTION 'Tournament does not have the expected number of matches' USING ERRCODE = '22023';
  END IF;

  IF v_completed_matches <> v_total_matches THEN
    RAISE EXCEPTION 'Not all tournament matches are completed' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = p_tournament_id
    AND NOT EXISTS (
      SELECT 1 FROM public.tournament_matches AS dest
      WHERE dest.tournament_id = p_tournament_id
        AND (dest.source_match_one_id = tm.id OR dest.source_match_two_id = tm.id)
    );

  IF v_bad_count <> 1 THEN
    RAISE EXCEPTION 'Tournament does not have exactly one final' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_final
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = p_tournament_id
    AND NOT EXISTS (
      SELECT 1 FROM public.tournament_matches AS dest
      WHERE dest.tournament_id = p_tournament_id
        AND (dest.source_match_one_id = tm.id OR dest.source_match_two_id = tm.id)
    );

  SELECT max(tm.round_number) INTO v_max_round
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = p_tournament_id;

  IF v_final.round_number <> v_max_round THEN
    RAISE EXCEPTION 'The final does not belong to the last round' USING ERRCODE = '22023';
  END IF;

  IF v_final.source_match_one_id IS NULL OR v_final.source_match_two_id IS NULL THEN
    RAISE EXCEPTION 'The final is missing its source matches' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_semifinal_one FROM public.tournament_matches AS tm WHERE tm.id = v_final.source_match_one_id;
  SELECT * INTO v_semifinal_two FROM public.tournament_matches AS tm WHERE tm.id = v_final.source_match_two_id;

  -- ── Entradas confirmadas = exactamente la primera ronda ────────────────
  SELECT array_agg(te.id ORDER BY te.id) INTO v_confirmed_entry_ids
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_entry_ids IS NULL OR array_length(v_confirmed_entry_ids, 1) <> v_tournament.bracket_size THEN
    RAISE EXCEPTION 'Confirmed entry count does not match the tournament bracket size' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_round1_entry_ids
  FROM (
    SELECT tm.entry_one_id AS x FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = p_tournament_id AND tm.round_number = 1
    UNION ALL
    SELECT tm.entry_two_id FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = p_tournament_id AND tm.round_number = 1
  ) AS entries;

  IF v_round1_entry_ids IS DISTINCT FROM v_confirmed_entry_ids THEN
    RAISE EXCEPTION 'The first round does not match the confirmed entries exactly' USING ERRCODE = '22023';
  END IF;

  -- ── Cada entrada confirmada tiene exactamente dos miembros ─────────────
  -- (agrupación por entry, no un total global — detecta también una
  -- entry con CERO miembros, que un GROUP BY simple no mostraría).
  SELECT count(*) INTO v_bad_count
  FROM unnest(v_confirmed_entry_ids) AS entry_id
  LEFT JOIN (
    SELECT tem.tournament_entry_id, count(*) AS member_count
    FROM public.tournament_entry_members AS tem
    WHERE tem.tournament_entry_id = ANY(v_confirmed_entry_ids)
    GROUP BY tem.tournament_entry_id
  ) AS member_counts ON member_counts.tournament_entry_id = entry_id
  WHERE COALESCE(member_counts.member_count, 0) <> 2;

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'A confirmed entry does not have exactly two members' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count
  FROM (
    SELECT tem.club_member_id
    FROM public.tournament_entry_members AS tem
    WHERE tem.tournament_entry_id = ANY(v_confirmed_entry_ids)
    GROUP BY tem.club_member_id
    HAVING count(*) > 1
  ) AS duplicates;

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'A player appears in more than one confirmed entry' USING ERRCODE = '22023';
  END IF;

  -- ── Derivar posiciones exclusivamente del bracket ──────────────────────
  v_champion_entry_id := v_final.winner_entry_id;
  v_runner_up_entry_id := CASE
    WHEN v_final.winner_entry_id = v_final.entry_one_id THEN v_final.entry_two_id
    ELSE v_final.entry_one_id
  END;
  v_semifinalist_one_entry_id := CASE
    WHEN v_semifinal_one.winner_entry_id = v_semifinal_one.entry_one_id THEN v_semifinal_one.entry_two_id
    ELSE v_semifinal_one.entry_one_id
  END;
  v_semifinalist_two_entry_id := CASE
    WHEN v_semifinal_two.winner_entry_id = v_semifinal_two.entry_one_id THEN v_semifinal_two.entry_two_id
    ELSE v_semifinal_two.entry_one_id
  END;

  SELECT array_agg(tem.club_member_id) INTO v_participation_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = ANY(v_confirmed_entry_ids);

  SELECT array_agg(tem.club_member_id) INTO v_champion_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = v_champion_entry_id;

  SELECT array_agg(tem.club_member_id) INTO v_runner_up_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = v_runner_up_entry_id;

  SELECT array_agg(tem.club_member_id) INTO v_semifinalist_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id IN (v_semifinalist_one_entry_id, v_semifinalist_two_entry_id);

  -- ── Idempotencia — verificación previa por evento, nunca solo el total ─
  v_expected_total := (v_tournament.bracket_size * 2) + 2 + 2 + 4;

  SELECT
    count(*) FILTER (WHERE m.system_event_code = 'tournament_participation'),
    count(*) FILTER (WHERE m.system_event_code = 'tournament_champion'),
    count(*) FILTER (WHERE m.system_event_code = 'tournament_runner_up'),
    count(*) FILTER (WHERE m.system_event_code = 'tournament_semifinalist'),
    count(*)
  INTO v_participation_count, v_champion_count, v_runner_up_count, v_semifinalist_count, v_total_count
  FROM public.club_player_point_movements AS m
  WHERE m.tournament_id = p_tournament_id;

  IF v_total_count = 0 THEN
    NULL; -- procede a liquidar
  ELSIF v_participation_count = v_tournament.bracket_size * 2
        AND v_champion_count = 2
        AND v_runner_up_count = 2
        AND v_semifinalist_count = 4
        AND v_total_count = v_expected_total THEN
    v_already_awarded := true;
  ELSE
    RAISE EXCEPTION 'Tournament points are in a partial or inconsistent state' USING ERRCODE = '22023';
  END IF;

  IF v_already_awarded THEN
    RETURN QUERY SELECT
      p_tournament_id, v_participation_count, v_champion_count,
      v_runner_up_count, v_semifinalist_count, v_total_count, v_already_awarded;
    RETURN;
  END IF;

  -- ── Liquidación — un jugador a la vez, en orden determinístico ─────────
  -- Cada jugador recibe participación siempre y, como máximo, un evento
  -- de posición, en ese orden — así previous_total/new_total quedan
  -- siempre secuenciales para el mismo jugador.
  FOR v_member_id IN SELECT unnest(v_participation_member_ids) AS x ORDER BY x LOOP
    SELECT * INTO v_state
    FROM public.club_member_sport_state AS s
    WHERE s.club_member_id = v_member_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Player has no sport state yet' USING ERRCODE = 'P0002';
    END IF;

    -- Defensa en profundidad: nunca confiar en un solo camino para la
    -- coherencia de club, mismo criterio ya usado en
    -- adjust_club_player_points.
    IF v_state.club_id <> v_tournament.club_id THEN
      RAISE EXCEPTION 'Sport state does not belong to this club' USING ERRCODE = '22023';
    END IF;

    SELECT c.category INTO v_category
    FROM public.club_ranking_cycles AS c
    WHERE c.id = v_state.cycle_id;

    -- 1. tournament_participation — siempre.
    v_new_total := v_state.current_points + 5;

    UPDATE public.club_member_sport_state AS s
    SET current_points = v_new_total, points_reached_at = now()
    WHERE s.club_member_id = v_member_id;

    INSERT INTO public.club_player_point_movements (
      club_id, club_member_id, cycle_id, category,
      previous_total, new_total, delta,
      adjustment_mode, origin, system_event_code, tournament_id, comment, created_by
    ) VALUES (
      v_tournament.club_id, v_member_id, v_state.cycle_id, v_category,
      v_state.current_points, v_new_total, 5,
      'delta', 'system', 'tournament_participation', p_tournament_id, 'Participación en torneo', auth.uid()
    );

    v_state.current_points := v_new_total;

    -- 2. Evento de posición, como máximo uno.
    IF v_member_id = ANY(v_champion_member_ids) THEN
      v_new_total := v_state.current_points + 30;

      UPDATE public.club_member_sport_state AS s
      SET current_points = v_new_total, points_reached_at = now()
      WHERE s.club_member_id = v_member_id;

      INSERT INTO public.club_player_point_movements (
        club_id, club_member_id, cycle_id, category,
        previous_total, new_total, delta,
        adjustment_mode, origin, system_event_code, tournament_id, comment, created_by
      ) VALUES (
        v_tournament.club_id, v_member_id, v_state.cycle_id, v_category,
        v_state.current_points, v_new_total, 30,
        'delta', 'system', 'tournament_champion', p_tournament_id, 'Campeón de torneo', auth.uid()
      );
    ELSIF v_member_id = ANY(v_runner_up_member_ids) THEN
      v_new_total := v_state.current_points + 15;

      UPDATE public.club_member_sport_state AS s
      SET current_points = v_new_total, points_reached_at = now()
      WHERE s.club_member_id = v_member_id;

      INSERT INTO public.club_player_point_movements (
        club_id, club_member_id, cycle_id, category,
        previous_total, new_total, delta,
        adjustment_mode, origin, system_event_code, tournament_id, comment, created_by
      ) VALUES (
        v_tournament.club_id, v_member_id, v_state.cycle_id, v_category,
        v_state.current_points, v_new_total, 15,
        'delta', 'system', 'tournament_runner_up', p_tournament_id, 'Subcampeón de torneo', auth.uid()
      );
    ELSIF v_member_id = ANY(v_semifinalist_member_ids) THEN
      v_new_total := v_state.current_points + 5;

      UPDATE public.club_member_sport_state AS s
      SET current_points = v_new_total, points_reached_at = now()
      WHERE s.club_member_id = v_member_id;

      INSERT INTO public.club_player_point_movements (
        club_id, club_member_id, cycle_id, category,
        previous_total, new_total, delta,
        adjustment_mode, origin, system_event_code, tournament_id, comment, created_by
      ) VALUES (
        v_tournament.club_id, v_member_id, v_state.cycle_id, v_category,
        v_state.current_points, v_new_total, 5,
        'delta', 'system', 'tournament_semifinalist', p_tournament_id, 'Semifinalista de torneo', auth.uid()
      );
    END IF;
  END LOOP;

  -- ── Verificación posterior — conteos, eventos, club_id, origin ─────────
  SELECT
    count(*) FILTER (WHERE m.system_event_code = 'tournament_participation'),
    count(*) FILTER (WHERE m.system_event_code = 'tournament_champion'),
    count(*) FILTER (WHERE m.system_event_code = 'tournament_runner_up'),
    count(*) FILTER (WHERE m.system_event_code = 'tournament_semifinalist'),
    count(*)
  INTO v_participation_count, v_champion_count, v_runner_up_count, v_semifinalist_count, v_total_count
  FROM public.club_player_point_movements AS m
  WHERE m.tournament_id = p_tournament_id;

  IF v_participation_count <> v_tournament.bracket_size * 2
     OR v_champion_count <> 2
     OR v_runner_up_count <> 2
     OR v_semifinalist_count <> 4
     OR v_total_count <> v_expected_total THEN
    RAISE EXCEPTION 'Tournament points award produced an unexpected result' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.club_player_point_movements AS m
    WHERE m.tournament_id = p_tournament_id
      AND (m.club_id <> v_tournament.club_id OR m.origin <> 'system')
  ) THEN
    RAISE EXCEPTION 'Tournament points award produced inconsistent movements' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT
    p_tournament_id, v_participation_count, v_champion_count,
    v_runner_up_count, v_semifinalist_count, v_total_count, v_already_awarded;
END;
$$;

REVOKE ALL ON FUNCTION public.award_tournament_points(uuid) FROM PUBLIC;
