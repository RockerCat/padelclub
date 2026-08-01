-- ============================================================
-- Dashboard deportivo del PLAYER — perfil deportivo propio
-- Mi Pádel Club
-- ============================================================
-- club_member_sport_state, club_ranking_cycles, club_player_category_changes
-- y club_player_point_movements nacieron con RLS habilitada y CERO
-- políticas (20260820000001) — ningún cliente puede leerlas directamente,
-- ni siquiera sus propias filas. get_club_member_sport_state ya cubre
-- "categoría y puntos actuales" para OWNER/ADMIN/self, pero no expone
-- posición en el ranking, historial de puntos ni cambios de categoría —
-- las tres cosas que el nuevo Dashboard del PLAYER necesita para su
-- encabezado deportivo y su sección de evolución. Esta función es la
-- única pieza nueva de backend que ese Dashboard requiere: todo lo demás
-- (próxima actividad, torneos, resumen) se resuelve reutilizando RPCs y
-- tablas ya expuestas (get_club_category_ranking_view, tournament_entries,
-- reservations vía RLS existente).
--
-- Alcance deliberadamente acotado: self-only (el club_member_id se deriva
-- siempre de auth.uid() + p_club_id, nunca se recibe como parámetro) y
-- solo para una membresía PLAYER activa — no es una RPC administrativa,
-- no reemplaza get_club_member_sport_state (que sigue siendo la única vía
-- para que OWNER/ADMIN consulten el estado de OTRO miembro).
--
-- ─── Reconstrucción de "evolución" ──────────────────────────────────────
-- No existe ninguna tabla de posiciones históricas — la posición en el
-- ranking siempre se deriva en vivo (RANK() sobre club_member_sport_state,
-- ver get_club_category_ranking). Para poder graficar "cómo he
-- evolucionado" sin inventar ningún dato, esta función reconstruye, para
-- cada instante relevante (inicio del ciclo activo, cada movimiento propio
-- del jugador, y el instante actual), los puntos de CADA miembro activo
-- del mismo ciclo a partir del ledger real (club_player_point_movements:
-- último new_total con created_at <= ese instante, o 0 si el miembro
-- todavía no tiene movimiento — válido porque el ciclo arranca en 0 para
-- todos), y aplica el mismo criterio de desempate exacto que la propia
-- get_club_category_ranking usa hoy (puntos desc, luego el instante en que
-- se alcanzó ese total asc, luego club_member_id asc). El resultado es
-- honesto dentro de una limitación explícita: solo considera a los
-- miembros PLAYER actualmente activos del ciclo (el mismo universo que ya
-- usa el ranking en vivo) — un miembro que se unió o se desactivó a mitad
-- de camino no se refleja como tal en instantes pasados, exactamente la
-- misma simplificación que ya vive implícita en el ranking en vivo (que
-- tampoco puede mostrar "cómo era" antes de la membresía actual de cada
-- quien). La posición y los puntos "actuales" (fuera del arreglo de
-- evolución) SÍ se piden directamente a get_club_category_ranking, para
-- que el número mostrado en el encabezado sea siempre exactamente el
-- mismo que vería este jugador en /ranking, sin una segunda fórmula.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_club_sport_profile(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_member           public.club_members%ROWTYPE;
  v_state            public.club_member_sport_state%ROWTYPE;
  v_category         text;
  v_cycle_started_at timestamptz;
  v_ranking_position integer;
  v_ranking_total    integer;
  v_category_change  jsonb;
  v_ever_promoted    boolean;
  v_evolution        jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to view this sport profile' USING ERRCODE = '42501';
  END IF;

  IF v_member.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Sport profile is only available for PLAYER memberships' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_state FROM public.club_member_sport_state AS s WHERE s.club_member_id = v_member.id;

  -- Aprovisionamiento es automático (trigger sobre club_members) para todo
  -- PLAYER activo — no debería faltar, pero se responde con un perfil
  -- vacío en vez de un error si por alguna razón todavía no existe.
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'category', NULL,
      'currentPoints', 0,
      'rankingPosition', NULL,
      'rankingTotal', 0,
      'recentCategoryChange', NULL,
      'everPromoted', false,
      'evolution', '[]'::jsonb
    );
  END IF;

  SELECT c.category, c.started_at INTO v_category, v_cycle_started_at
  FROM public.club_ranking_cycles AS c WHERE c.id = v_state.cycle_id;

  -- Posición/total "ahora" — misma fórmula exacta que /ranking, nunca una
  -- segunda derivación: se le pide directamente a la función ya vigente.
  SELECT r.ranking_position INTO v_ranking_position
  FROM public.get_club_category_ranking(p_club_id, v_category) AS r
  WHERE r.club_member_id = v_member.id;

  SELECT count(*) INTO v_ranking_total
  FROM public.club_member_sport_state AS s2
  JOIN public.club_members AS cm2 ON cm2.id = s2.club_member_id
  WHERE s2.cycle_id = v_state.cycle_id AND cm2.is_active = true AND cm2.role = 'PLAYER';

  SELECT jsonb_build_object(
    'previousCategory', pcc.previous_category,
    'newCategory', pcc.new_category,
    'changeType', pcc.change_type,
    'createdAt', pcc.created_at
  )
  INTO v_category_change
  FROM public.club_player_category_changes AS pcc
  WHERE pcc.club_member_id = v_member.id
  ORDER BY pcc.created_at DESC
  LIMIT 1;

  SELECT EXISTS(
    SELECT 1 FROM public.club_player_category_changes AS pcc2
    WHERE pcc2.club_member_id = v_member.id AND pcc2.change_type = 'promotion'
  ) INTO v_ever_promoted;

  WITH snapshots AS (
    SELECT v_cycle_started_at AS at
    UNION
    SELECT m.created_at FROM public.club_player_point_movements AS m
    WHERE m.club_member_id = v_member.id AND m.cycle_id = v_state.cycle_id
    UNION
    SELECT now()
  ),
  cycle_members AS (
    SELECT s2.club_member_id
    FROM public.club_member_sport_state AS s2
    JOIN public.club_members AS cm2 ON cm2.id = s2.club_member_id
    WHERE s2.cycle_id = v_state.cycle_id AND cm2.is_active = true AND cm2.role = 'PLAYER'
  ),
  member_points_at AS (
    SELECT
      snap.at AS snapshot_at,
      cmid.club_member_id,
      COALESCE(
        (SELECT m2.new_total FROM public.club_player_point_movements AS m2
         WHERE m2.club_member_id = cmid.club_member_id AND m2.cycle_id = v_state.cycle_id
           AND m2.created_at <= snap.at
         ORDER BY m2.created_at DESC LIMIT 1),
        0
      ) AS points,
      COALESCE(
        (SELECT m3.created_at FROM public.club_player_point_movements AS m3
         WHERE m3.club_member_id = cmid.club_member_id AND m3.cycle_id = v_state.cycle_id
           AND m3.created_at <= snap.at
         ORDER BY m3.created_at DESC LIMIT 1),
        v_cycle_started_at
      ) AS reached_at
    FROM snapshots AS snap
    CROSS JOIN cycle_members AS cmid
  ),
  ranked AS (
    SELECT
      snapshot_at,
      club_member_id,
      points,
      RANK() OVER (
        PARTITION BY snapshot_at
        ORDER BY points DESC, reached_at ASC, club_member_id ASC
      ) AS ranking_position
    FROM member_points_at
  )
  SELECT jsonb_agg(
    jsonb_build_object('snapshotAt', r.snapshot_at, 'points', r.points, 'rankingPosition', r.ranking_position)
    ORDER BY r.snapshot_at ASC
  )
  INTO v_evolution
  FROM ranked AS r
  WHERE r.club_member_id = v_member.id;

  RETURN jsonb_build_object(
    'category', v_category,
    'currentPoints', v_state.current_points,
    'rankingPosition', v_ranking_position,
    'rankingTotal', v_ranking_total,
    'recentCategoryChange', v_category_change,
    'everPromoted', v_ever_promoted,
    'evolution', COALESCE(v_evolution, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_club_sport_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_club_sport_profile(uuid) TO authenticated;
