-- ============================================================
-- Resumen de premiación deportiva — lectura del ledger real
-- (Bloque 2.5.1, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Auditoría previa (obligatoria, confirmada antes de este archivo):
-- public.club_player_point_movements y public.club_member_sport_state
-- tienen RLS habilitada con CERO políticas (cerradas para OWNER, ADMIN,
-- PLAYER y anon por igual, confirmado por grep sobre todas las
-- migraciones) — la única forma de exponer el resultado real de
-- award_tournament_points() a la aplicación es una RPC de solo lectura
-- dedicada. Ninguna columna de tournaments marca "premiado"; no se
-- agrega ninguna aquí (fuera de alcance de este bloque, decidido
-- explícitamente).
--
-- Releído completo antes de escribir esta función: award_tournament_
-- points() (20260914000001) — reason codes exactos
-- ('tournament_participation'/'tournament_champion'/
-- 'tournament_runner_up'/'tournament_semifinalist'), origin='system',
-- expected_movement_count = bracket_size*2 + 8 (participación = 2 ×
-- bracket_size, siempre 2 campeones, 2 subcampeones, 4 semifinalistas),
-- la semántica exacta de already_awarded (conteo total = 0 → nada
-- liquidado; conteo total = expected exacto → completo; cualquier otro
-- conteo → parcial/inconsistente, nunca reparado). Esta función replica
-- esa MISMA lógica de clasificación de estado, en modo solo lectura,
-- nunca una regla distinta.
--
-- Autorización: mismo patrón corregido y vigente citado en todos los
-- bloques anteriores (20260825000001) — pero, a diferencia de las RPCs
-- administrativas de Torneos, aquí CUALQUIER membresía activa (OWNER,
-- ADMIN o PLAYER) queda autorizada; club_members.role ya está
-- restringido a esos tres valores por su propio CHECK, así que no hace
-- falta ninguna comparación de rol adicional una vez confirmada la
-- membresía activa. p_club_id nunca se confía a ciegas: se valida contra
-- el club_id real del torneo (v_tournament.club_id) antes de autorizar,
-- y la autorización se resuelve siempre contra ese club_id real, nunca
-- contra el parámetro.
--
-- Fuente de verdad: exclusivamente club_player_point_movements, filtrado
-- por tournament_id + club_id + origin='system' + los 4 system_event_code
-- reales — nunca movimientos manuales, nunca otro torneo. Ningún delta,
-- previous_total ni new_total se recalcula; se leen tal cual del ledger.
-- previous_total/new_total explícitamente NO se exponen (pedido
-- explícito) — solo delta.
--
-- Placement (campeón/subcampeón/semifinalista/participante): derivado
-- exclusivamente de la topología del bracket ya completado (la final sin
-- destino + sus dos partidos fuente), exactamente la misma derivación que
-- award_tournament_points() ya usa para clasificar antes de otorgar —
-- nunca leído desde el propio system_event_code del movimiento, y nunca
-- recalculando puntos, solo clasificando la posición para presentación.
--
-- Salida: cuando no existe ningún movimiento del torneo todavía (estado
-- pending o ready), se devuelve una única fila "centinela" con los
-- campos de estado poblados y el resto en NULL — nunca cero filas, para
-- que el estado general siga siendo visible sin necesitar una segunda
-- llamada. Cuando sí existen movimientos (awarded o partial), se
-- devuelve una fila por movimiento real del ledger (un jugador con
-- participación + premio aparece dos veces, nunca agregado en una sola
-- fila sintética) — todo tal como el propio ledger lo registró.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_tournament_points_summary(
  p_club_id       uuid,
  p_tournament_id uuid
)
RETURNS TABLE (
  award_state             text,
  expected_movement_count integer,
  actual_movement_count   integer,
  club_member_id          uuid,
  entry_id                uuid,
  player_name             text,
  avatar_url              text,
  placement               text,
  system_event_code       text,
  delta                   integer,
  created_at              timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament          public.tournaments%ROWTYPE;
  v_caller_member        public.club_members%ROWTYPE;
  v_expected_count       integer;
  v_actual_count         integer;
  v_award_state          text;
  v_final                public.tournament_matches%ROWTYPE;
  v_semifinal_one        public.tournament_matches%ROWTYPE;
  v_semifinal_two        public.tournament_matches%ROWTYPE;
  v_champion_entry_id    uuid;
  v_runner_up_entry_id   uuid;
  v_semifinalist_one_id  uuid;
  v_semifinalist_two_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id;

  -- p_club_id nunca se confía a ciegas — debe coincidir con el club_id
  -- real del torneo, o se trata igual que "no encontrado" (nunca revela
  -- si el torneo existe en otro club).
  IF NOT FOUND OR v_tournament.club_id <> p_club_id THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to view points for this tournament' USING ERRCODE = '42501';
  END IF;

  -- Cualquier rol con membresía activa (OWNER, ADMIN, PLAYER) queda
  -- autorizado aquí — a propósito, sin comparación de rol adicional.

  v_expected_count := (v_tournament.bracket_size * 2) + 8;

  SELECT count(*) INTO v_actual_count
  FROM public.club_player_point_movements AS m
  WHERE m.tournament_id = p_tournament_id
    AND m.club_id = v_tournament.club_id
    AND m.origin = 'system'
    AND m.system_event_code IN (
      'tournament_participation', 'tournament_champion', 'tournament_runner_up', 'tournament_semifinalist'
    );

  IF v_tournament.status <> 'completed' THEN
    v_award_state := 'pending';
  ELSIF v_actual_count = 0 THEN
    v_award_state := 'ready';
  ELSIF v_actual_count = v_expected_count THEN
    v_award_state := 'awarded';
  ELSE
    v_award_state := 'partial';
  END IF;

  IF v_actual_count = 0 THEN
    RETURN QUERY SELECT
      v_award_state, v_expected_count, v_actual_count,
      NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  -- ── Placement derivado exclusivamente de la topología del bracket ─────
  -- Misma lógica exacta que award_tournament_points(): la final es el
  -- único partido sin destino; sus dos fuentes son las semifinales.
  SELECT * INTO v_final
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = p_tournament_id
    AND NOT EXISTS (
      SELECT 1 FROM public.tournament_matches AS dest
      WHERE dest.tournament_id = p_tournament_id
        AND (dest.source_match_one_id = tm.id OR dest.source_match_two_id = tm.id)
    );

  IF FOUND AND v_final.source_match_one_id IS NOT NULL AND v_final.source_match_two_id IS NOT NULL THEN
    SELECT * INTO v_semifinal_one FROM public.tournament_matches AS tm WHERE tm.id = v_final.source_match_one_id;
    SELECT * INTO v_semifinal_two FROM public.tournament_matches AS tm WHERE tm.id = v_final.source_match_two_id;

    v_champion_entry_id := v_final.winner_entry_id;
    v_runner_up_entry_id := CASE
      WHEN v_final.winner_entry_id = v_final.entry_one_id THEN v_final.entry_two_id
      ELSE v_final.entry_one_id
    END;
    v_semifinalist_one_id := CASE
      WHEN v_semifinal_one.winner_entry_id = v_semifinal_one.entry_one_id THEN v_semifinal_one.entry_two_id
      ELSE v_semifinal_one.entry_one_id
    END;
    v_semifinalist_two_id := CASE
      WHEN v_semifinal_two.winner_entry_id = v_semifinal_two.entry_one_id THEN v_semifinal_two.entry_two_id
      ELSE v_semifinal_two.entry_one_id
    END;
  END IF;

  RETURN QUERY
  SELECT
    v_award_state,
    v_expected_count,
    v_actual_count,
    m.club_member_id,
    confirmed_entry.tournament_entry_id,
    p.full_name,
    p.avatar_url,
    CASE
      WHEN confirmed_entry.tournament_entry_id = v_champion_entry_id THEN 'champion'
      WHEN confirmed_entry.tournament_entry_id = v_runner_up_entry_id THEN 'runner_up'
      WHEN confirmed_entry.tournament_entry_id IN (v_semifinalist_one_id, v_semifinalist_two_id) THEN 'semifinalist'
      ELSE 'participant'
    END,
    m.system_event_code,
    m.delta,
    m.created_at
  FROM public.club_player_point_movements AS m
  JOIN public.club_members AS cm ON cm.id = m.club_member_id
  JOIN public.profiles AS p ON p.id = cm.profile_id
  -- Subconsulta, nunca un JOIN directo contra tournament_entry_members:
  -- un jugador solo puede tener una entry CONFIRMED en este torneo (la
  -- premiación ya lo exige), pero podría además aparecer en una entry
  -- withdrawn distinta — filtrar por status='confirmed' dentro de la
  -- propia subconsulta evita cualquier fan-out de filas antes de llegar
  -- al SELECT principal.
  LEFT JOIN (
    SELECT tem.club_member_id, tem.tournament_entry_id
    FROM public.tournament_entry_members AS tem
    JOIN public.tournament_entries AS te
      ON te.id = tem.tournament_entry_id
     AND te.tournament_id = p_tournament_id
     AND te.club_id = v_tournament.club_id
     AND te.status = 'confirmed'
    WHERE tem.tournament_id = p_tournament_id
  ) AS confirmed_entry ON confirmed_entry.club_member_id = m.club_member_id
  WHERE m.tournament_id = p_tournament_id
    AND m.club_id = v_tournament.club_id
    AND m.origin = 'system'
    AND m.system_event_code IN (
      'tournament_participation', 'tournament_champion', 'tournament_runner_up', 'tournament_semifinalist'
    )
  ORDER BY
    CASE
      WHEN confirmed_entry.tournament_entry_id = v_champion_entry_id THEN 1
      WHEN confirmed_entry.tournament_entry_id = v_runner_up_entry_id THEN 2
      WHEN confirmed_entry.tournament_entry_id IN (v_semifinalist_one_id, v_semifinalist_two_id) THEN 3
      ELSE 4
    END,
    p.full_name ASC,
    m.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_points_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_points_summary(uuid, uuid) TO authenticated;
