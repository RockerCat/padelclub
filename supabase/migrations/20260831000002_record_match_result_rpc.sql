-- ============================================================
-- record_match_result — Fase 2 módulo deportivo, bloque 1 (RPC)
-- Mi Pádel Club
-- ============================================================
-- Única función de escritura sobre match_results/match_result_players/
-- match_result_sets. Registra un resultado nuevo, o corrige uno vigente
-- (misma función para ambos casos — nunca una segunda copia de esta
-- validación): si ya existe un resultado 'active' para la reserva, lo
-- marca 'superseded' (nunca lo borra, nunca lo sobrescribe) e inserta uno
-- nuevo enlazado.
--
-- NO otorga puntos, NO llama adjust_club_player_points/
-- change_club_player_category, NO escribe en club_player_point_movements,
-- NO toca club_member_sport_state/club_ranking_cycles/category — el
-- resultado queda listo para que una fase posterior otorgue puntos de
-- forma idempotente usando match_result_id como referencia (columna que
-- todavía no existe en el ledger — se agregará en esa fase, no en esta).
--
-- Parámetros de equipo van por profile_id (no club_member_id): así el
-- caller (UI) puede reutilizar directamente la misma lista de
-- participantes ya resuelta por el patrón existente
-- (reservation_players ∪ creador-si-es-PLAYER, ver
-- get_my_profile_activity/_my_reservations, 20260817000001) sin tener que
-- resolver club_members.id por su cuenta — esta función lo hace, de forma
-- autoritativa, sin confiar en absolutamente nada más del cliente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_match_result(
  p_club_id             uuid,
  p_reservation_id      uuid,
  p_team_1_profile_ids  uuid[],
  p_team_2_profile_ids  uuid[],
  p_team_1_games        integer[],
  p_team_2_games        integer[]
)
RETURNS TABLE (match_result_id uuid, winning_team smallint, corrected boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation         public.reservations%ROWTYPE;
  v_end_at              timestamptz;
  v_expected_profiles   uuid[];
  v_submitted_profiles  uuid[];
  v_team1_members       uuid[];
  v_team2_members       uuid[];
  v_set_count           integer;
  v_team1_sets_won      integer := 0;
  v_team2_sets_won      integer := 0;
  v_winning_team        smallint;
  v_existing_id         uuid;
  v_new_id              uuid;
  i                     integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Autorización explícita y directa contra club_members — nunca un
  -- helper de rol cuyo resultado pueda ser NULL, misma disciplina ya
  -- exigida para toda RPC deportiva (ver Sport/Ranking Module Principles).
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.profile_id = auth.uid()
      AND cm.club_id = p_club_id
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorized to record match results for this club' USING ERRCODE = '42501';
  END IF;

  -- Bloquea la reserva — serializa contra una edición/cancelación
  -- concurrente de la misma reserva mientras se registra el resultado.
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id AND club_id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.type != 'match' THEN
    RAISE EXCEPTION 'Only match reservations can have a result' USING ERRCODE = '22023';
  END IF;

  IF v_reservation.status != 'confirmed' THEN
    RAISE EXCEPTION 'Reservation is not confirmed' USING ERRCODE = '22023';
  END IF;

  -- Mismo idioma de zona horaria ya establecido en todo el proyecto
  -- (America/Bogota) para "ya terminó" — nunca una convención nueva.
  v_end_at := ((v_reservation.date + v_reservation.start_time) AT TIME ZONE 'America/Bogota')
              + (v_reservation.duration_minutes || ' minutes')::interval;

  IF v_end_at > now() THEN
    RAISE EXCEPTION 'Reservation has not finished yet' USING ERRCODE = '22023';
  END IF;

  -- Participantes reales de la reserva — misma regla ya documentada y
  -- aplicada en get_my_profile_activity/_my_reservations
  -- (20260817000001): reservation_players, o el creador únicamente
  -- cuando su propio profiles.account_type es 'PLAYER' (una reserva
  -- administrativa nunca cuenta como jugada por quien la creó).
  SELECT array_agg(DISTINCT profile_id) INTO v_expected_profiles
  FROM (
    SELECT rp.profile_id
    FROM public.reservation_players rp
    WHERE rp.reservation_id = p_reservation_id
    UNION
    SELECT r.created_by
    FROM public.reservations r
    JOIN public.profiles p ON p.id = r.created_by
    WHERE r.id = p_reservation_id AND p.account_type = 'PLAYER'
  ) AS participants;

  IF COALESCE(array_length(v_expected_profiles, 1), 0) != 4 THEN
    RAISE EXCEPTION 'Exactly 4 players are required to record a result' USING ERRCODE = 'P0007';
  END IF;

  -- Equipos: exactamente 2 y 2, sin repetidos, y coincidiendo EXACTAMENTE
  -- (ni de más ni de menos) con los 4 participantes reales de arriba —
  -- nunca se confía en profile_id/club_member_id ajenos a la reserva.
  IF COALESCE(array_length(p_team_1_profile_ids, 1), 0) != 2
     OR COALESCE(array_length(p_team_2_profile_ids, 1), 0) != 2 THEN
    RAISE EXCEPTION 'Each team must have exactly 2 players' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_submitted_profiles
  FROM unnest(p_team_1_profile_ids || p_team_2_profile_ids) AS x;

  IF COALESCE(array_length(v_submitted_profiles, 1), 0) != 4 THEN
    RAISE EXCEPTION 'A player cannot appear more than once' USING ERRCODE = '22023';
  END IF;

  IF NOT (v_submitted_profiles @> v_expected_profiles AND v_expected_profiles @> v_submitted_profiles) THEN
    RAISE EXCEPTION 'Players must match the reservation participants exactly' USING ERRCODE = '22023';
  END IF;

  -- profile_id → club_members.id dentro de ESTE club — la identidad
  -- deportiva ancla siempre en club_members.id, nunca en profiles.id
  -- (Sport/Ranking Module Principles). Un profile de otro club
  -- simplemente no resuelve aquí (el JOIN exige club_id = p_club_id), así
  -- que nunca hace falta un chequeo aparte para "jugador de otro club".
  SELECT array_agg(cm.id) INTO v_team1_members
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id AND cm.profile_id = ANY (p_team_1_profile_ids);

  SELECT array_agg(cm.id) INTO v_team2_members
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id AND cm.profile_id = ANY (p_team_2_profile_ids);

  IF COALESCE(array_length(v_team1_members, 1), 0) != 2
     OR COALESCE(array_length(v_team2_members, 1), 0) != 2 THEN
    RAISE EXCEPTION 'Could not resolve all players to club memberships' USING ERRCODE = 'P0002';
  END IF;

  -- Marcador: 2 o 3 sets, ningún set empatado, valores no negativos —
  -- validado también a nivel de fila por los CHECK de match_result_sets,
  -- repetido aquí solo para poder devolver un error temprano y claro
  -- antes de intentar ningún INSERT.
  v_set_count := array_length(p_team_1_games, 1);
  IF v_set_count IS NULL
     OR v_set_count != COALESCE(array_length(p_team_2_games, 1), -1)
     OR v_set_count < 2 OR v_set_count > 3 THEN
    RAISE EXCEPTION 'A match must have 2 or 3 sets' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1..v_set_count LOOP
    IF p_team_1_games[i] IS NULL OR p_team_2_games[i] IS NULL
       OR p_team_1_games[i] < 0 OR p_team_2_games[i] < 0 THEN
      RAISE EXCEPTION 'Set scores cannot be negative' USING ERRCODE = '22023';
    END IF;
    IF p_team_1_games[i] = p_team_2_games[i] THEN
      RAISE EXCEPTION 'A set cannot end tied' USING ERRCODE = '22023';
    END IF;
    IF p_team_1_games[i] > p_team_2_games[i] THEN
      v_team1_sets_won := v_team1_sets_won + 1;
    ELSE
      v_team2_sets_won := v_team2_sets_won + 1;
    END IF;
  END LOOP;

  -- Un ganador claro: 2 sets → 2-0; 3 sets → 2-1. Nunca un cuarto set,
  -- nunca un resultado sin ganador inequívoco.
  IF v_set_count = 2 AND (v_team1_sets_won, v_team2_sets_won) NOT IN ((2, 0), (0, 2)) THEN
    RAISE EXCEPTION 'A 2-set match must be won 2-0' USING ERRCODE = '22023';
  END IF;
  IF v_set_count = 3 AND (v_team1_sets_won, v_team2_sets_won) NOT IN ((2, 1), (1, 2)) THEN
    RAISE EXCEPTION 'A 3-set match must be won 2-1' USING ERRCODE = '22023';
  END IF;

  v_winning_team := CASE WHEN v_team1_sets_won > v_team2_sets_won THEN 1 ELSE 2 END;

  -- Serializa envíos concurrentes para la MISMA reserva — el índice único
  -- parcial (match_results_one_active_per_reservation) es la garantía
  -- real; este lock solo evita que dos envíos simultáneos choquen entre
  -- sí de forma confusa en vez de limpia.
  PERFORM pg_advisory_xact_lock(hashtext('match_result:' || p_reservation_id::text));

  -- Corrección: si ya hay un resultado vigente, se retira del índice
  -- 'active' ANTES de insertar el nuevo (nunca al revés — insertar primero
  -- violaría el índice único parcial, ya que ambas filas serían 'active'
  -- por un instante). El resultado anterior nunca se borra ni se
  -- sobrescribe — solo cambia de estado.
  SELECT id INTO v_existing_id
  FROM public.match_results
  WHERE reservation_id = p_reservation_id AND status = 'active';

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.match_results
    SET status = 'superseded', updated_at = now()
    WHERE id = v_existing_id;
  END IF;

  INSERT INTO public.match_results (club_id, reservation_id, status, winning_team, recorded_by)
  VALUES (p_club_id, p_reservation_id, 'active', v_winning_team, auth.uid())
  RETURNING id INTO v_new_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.match_results SET superseded_by = v_new_id WHERE id = v_existing_id;
  END IF;

  INSERT INTO public.match_result_players (match_result_id, club_id, club_member_id, team_number)
  SELECT v_new_id, p_club_id, m, 1 FROM unnest(v_team1_members) AS m
  UNION ALL
  SELECT v_new_id, p_club_id, m, 2 FROM unnest(v_team2_members) AS m;

  INSERT INTO public.match_result_sets (match_result_id, club_id, set_number, team_1_games, team_2_games)
  SELECT v_new_id, p_club_id, s, p_team_1_games[s], p_team_2_games[s]
  FROM generate_series(1, v_set_count) AS s;

  RETURN QUERY SELECT v_new_id, v_winning_team, (v_existing_id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.record_match_result(uuid, uuid, uuid[], uuid[], integer[], integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_match_result(uuid, uuid, uuid[], uuid[], integer[], integer[]) TO authenticated;
