-- ============================================================
-- Resultados de partidos — Fase 2 módulo deportivo, bloque 1 (esquema)
-- Mi Pádel Club
-- ============================================================
-- Cierra únicamente: Reserva finalizada → Equipos → Marcador → Ganador →
-- Estadísticas reales. NO otorga puntos, NO toca el ledger
-- (club_player_point_movements), NO recalcula ranking ni categorías —
-- explícitamente fuera de alcance de este bloque (fase posterior, cuando
-- match_result_id ya exista como referencia idempotente para el ledger).
--
-- Tres tablas normalizadas, nacen cerradas — mismo patrón exacto que
-- club_member_sport_state/club_ranking_cycles (20260820000001): RLS
-- habilitado, únicamente políticas SELECT para authenticated, ningún
-- GRANT de INSERT/UPDATE/DELETE. Toda escritura ocurre exclusivamente vía
-- la RPC SECURITY DEFINER record_match_result (próxima migración) —
-- nunca un INSERT/UPDATE directo de cliente.
-- ============================================================


-- ─── 1. match_results ────────────────────────────────────────────────────
-- Un resultado por reserva "vigente" a la vez. Las correcciones nunca
-- sobrescriben ni borran — insertan una fila NUEVA y la anterior pasa a
-- 'superseded' (nunca se elimina), conservando quién registró, cuándo, y
-- el enlace explícito a qué fila la reemplazó. reservation_id NO es
-- UNIQUE a nivel de tabla (una reserva puede acumular historial de
-- correcciones) — la garantía real de "como máximo un vigente" es el
-- índice único parcial de más abajo.
CREATE TABLE public.match_results (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid        NOT NULL REFERENCES public.clubs(id),
  reservation_id uuid        NOT NULL REFERENCES public.reservations(id),
  status         text        NOT NULL DEFAULT 'active',
  winning_team   smallint    NOT NULL,
  recorded_by    uuid        NOT NULL REFERENCES public.profiles(id),
  superseded_by  uuid        REFERENCES public.match_results(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_results_status_valid CHECK (status IN ('active', 'superseded')),
  CONSTRAINT match_results_winning_team_valid CHECK (winning_team IN (1, 2)),
  -- Auxiliar para el FK compuesto de match_result_players/sets de abajo —
  -- mismo patrón ya usado por club_ranking_cycles_id_club_id_key.
  CONSTRAINT match_results_id_club_id_key UNIQUE (id, club_id)
);

-- La garantía real: nunca más de un resultado 'active' por reserva. Una
-- corrección concurrente pierde la carrera aquí, no solo en el advisory
-- lock de la RPC (belt-and-suspenders, mismo patrón que
-- club_ranking_cycles_one_active_per_club_category).
CREATE UNIQUE INDEX match_results_one_active_per_reservation
  ON public.match_results (reservation_id)
  WHERE status = 'active';

CREATE INDEX match_results_club_idx ON public.match_results (club_id);


-- ─── 2. match_result_players ────────────────────────────────────────────
-- Exactamente 4 filas por resultado (2 por equipo) — la aritmética
-- exacta (2+2, sin repetidos, coincidiendo con los participantes reales
-- de la reserva) la garantiza record_match_result, el único camino de
-- escritura; no hay INSERT directo de cliente que pueda saltársela.
CREATE TABLE public.match_result_players (
  id              uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  match_result_id uuid     NOT NULL,
  club_id         uuid     NOT NULL,
  club_member_id  uuid     NOT NULL,
  team_number     smallint NOT NULL,

  CONSTRAINT match_result_players_team_valid CHECK (team_number IN (1, 2)),
  -- Compuesto contra match_results_id_club_id_key: nunca permite que
  -- club_id de esta fila diverja del club_id real del resultado padre —
  -- mismo "nunca confiar en una sola capa" que el resto del módulo
  -- deportivo ya usa (club_member_sport_state, etc.).
  CONSTRAINT match_result_players_result_club_fk
    FOREIGN KEY (match_result_id, club_id) REFERENCES public.match_results (id, club_id) ON DELETE CASCADE,
  CONSTRAINT match_result_players_member_club_fk
    FOREIGN KEY (club_member_id, club_id) REFERENCES public.club_members (id, club_id),
  -- Un jugador nunca puede aparecer dos veces en el mismo resultado
  -- (ni dos veces en el mismo equipo, ni una vez en cada uno).
  CONSTRAINT match_result_players_unique_per_result UNIQUE (match_result_id, club_member_id)
);

CREATE INDEX match_result_players_result_idx ON public.match_result_players (match_result_id);
-- Sostiene "Partidos jugados"/victorias/derrotas por club_member_id —
-- exactamente el acceso que necesitarán las estadísticas del bloque 9.
CREATE INDEX match_result_players_member_idx ON public.match_result_players (club_member_id);


-- ─── 3. match_result_sets ────────────────────────────────────────────────
-- Marcador estructurado (nunca texto libre) — al mejor de 3 sets, sin
-- modelar reglas de desempate profesionales: solo rechaza lo evidentemente
-- imposible (empate en games dentro de un mismo set, valores negativos).
-- La coherencia agregada (2 o 3 sets en total, un ganador claro de 2 sets)
-- la valida record_match_result, no es expresable como CHECK de una sola
-- fila.
CREATE TABLE public.match_result_sets (
  id              uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  match_result_id uuid     NOT NULL,
  club_id         uuid     NOT NULL,
  set_number      smallint NOT NULL,
  team_1_games    smallint NOT NULL,
  team_2_games    smallint NOT NULL,

  -- Mismo compuesto que match_result_players — club_id nunca puede
  -- divergir del club_id real del resultado padre.
  CONSTRAINT match_result_sets_result_club_fk
    FOREIGN KEY (match_result_id, club_id) REFERENCES public.match_results (id, club_id) ON DELETE CASCADE,
  CONSTRAINT match_result_sets_number_valid CHECK (set_number IN (1, 2, 3)),
  CONSTRAINT match_result_sets_games_non_negative CHECK (team_1_games >= 0 AND team_2_games >= 0),
  -- Un set terminado nunca queda empatado en games (incluso con
  -- tiebreak, el marcador final de un set siempre favorece a un lado).
  CONSTRAINT match_result_sets_not_tied CHECK (team_1_games != team_2_games),
  CONSTRAINT match_result_sets_unique_per_result UNIQUE (match_result_id, set_number)
);

CREATE INDEX match_result_sets_result_idx ON public.match_result_sets (match_result_id);


-- ─── RLS — nacen cerradas, mismo patrón que club_member_sport_state ──────
-- Lectura para cualquier miembro ACTIVO del club (OWNER/ADMIN/PLAYER) —
-- los resultados no son públicos, y las mutaciones son exclusivamente vía
-- record_match_result (SECURITY DEFINER, próxima migración). Reutiliza
-- club_role(), el mismo helper ya usado por la política de lectura de
-- reservations ("club members read reservations", 20260611000007).
ALTER TABLE public.match_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_result_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_result_sets    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_members_read_match_results"
  ON public.match_results FOR SELECT
  USING (public.club_role(club_id) IS NOT NULL);

CREATE POLICY "club_members_read_match_result_players"
  ON public.match_result_players FOR SELECT
  USING (public.club_role(club_id) IS NOT NULL);

CREATE POLICY "club_members_read_match_result_sets"
  ON public.match_result_sets FOR SELECT
  USING (public.club_role(club_id) IS NOT NULL);

-- GRANT de tabla explícito, solo SELECT — Postgres evalúa el GRANT ANTES
-- que las políticas de RLS; sin este GRANT, la política de arriba nunca
-- se alcanza y toda lectura falla con "permission denied" pese a la
-- política permisiva (precedente ya confirmado en el proyecto,
-- 20260624000001). Ningún GRANT de INSERT/UPDATE/DELETE — deliberado,
-- misma postura que club_member_sport_state/club_ranking_cycles: toda
-- escritura pasa exclusivamente por la RPC SECURITY DEFINER.
GRANT SELECT ON public.match_results        TO authenticated;
GRANT SELECT ON public.match_result_players TO authenticated;
GRANT SELECT ON public.match_result_sets    TO authenticated;
