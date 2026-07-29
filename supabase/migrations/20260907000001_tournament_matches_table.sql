-- ============================================================
-- Tournament matches — partidos oficiales del bracket
-- (Bloque 1.3, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Solo estructura: identidad en el cuadro (round_number/match_number),
-- participantes materializados, topología de fuentes, programación
-- opcional dentro de una asignación de cancha, y MatchScore embebido
-- mediante columnas fijas (mismo tipo smallint que ya usó el diseño
-- retirado de match_result_sets). Ninguna función de generación de
-- bracket, cálculo de ganador, avance, corrección, RLS ni trigger de
-- negocio se crea aquí.
--
-- Sin TournamentRound: round_number/match_number identifican la
-- posición en el cuadro; UNIQUE(tournament_id, round_number,
-- match_number) es la única garantía de unicidad de posición.
--
-- source_match_one_id/source_match_two_id (nunca next_match_id): la
-- relación siempre apunta desde el partido destino hacia sus fuentes,
-- nunca al revés — la futura función de generación conoce y materializa
-- ambos sentidos cuando corresponde.
--
-- entry_one_id/entry_two_id son nullable y, cuando existen, deben
-- pertenecer al mismo torneo (FK compuesta); no se exige ninguna
-- equivalencia rígida entre "tiene fuente" y "tiene participante" — un
-- partido de ronda posterior puede tener fuente definida y participante
-- aún no materializado, ambos estados son válidos durante el ciclo de
-- vida y se resuelven en la futura función, no aquí.
--
-- Ninguna FK simple redundante: cada relación ya queda garantizada por
-- su FK compuesta correspondiente (p. ej. court_id nunca se valida
-- directamente contra courts — queda garantizado transitivamente por
-- (tournament_court_allocation_id, court_id) →
-- tournament_court_allocations(id, court_id), cuyo propio court_id ya
-- está validado contra el club correcto desde su propia migración).
--
-- Sin ON DELETE CASCADE en ninguna FK — misma postura de historia
-- permanente ya aplicada al resto del módulo.
-- ============================================================

CREATE TABLE public.tournament_matches (
  id                             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id                  uuid        NOT NULL,
  club_id                        uuid        NOT NULL,
  round_number                   integer     NOT NULL,
  match_number                   integer     NOT NULL,
  status                         text        NOT NULL DEFAULT 'pending',
  source_match_one_id            uuid,
  source_match_two_id            uuid,
  entry_one_id                   uuid,
  entry_two_id                   uuid,
  tournament_court_allocation_id uuid,
  court_id                       uuid,
  scheduled_date                 date,
  scheduled_start_time           time,
  scheduled_end_time             time,
  set_one_entry_one              smallint,
  set_one_entry_two              smallint,
  set_two_entry_one              smallint,
  set_two_entry_two              smallint,
  set_three_entry_one            smallint,
  set_three_entry_two            smallint,
  winner_entry_id                uuid,
  started_at                     timestamptz,
  completed_at                   timestamptz,
  completed_by                   uuid        REFERENCES public.profiles(id),
  cancelled_at                   timestamptz,
  cancelled_by                   uuid        REFERENCES public.profiles(id),
  created_by                     uuid        NOT NULL REFERENCES public.profiles(id),
  updated_by                     uuid        NOT NULL REFERENCES public.profiles(id),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),

  -- ── Identidad en el bracket ──────────────────────────────────────────
  CONSTRAINT tournament_matches_id_tournament_id_key
    UNIQUE (id, tournament_id),
  CONSTRAINT tournament_matches_tournament_round_match_key
    UNIQUE (tournament_id, round_number, match_number),
  CONSTRAINT tournament_matches_round_number_positive
    CHECK (round_number > 0),
  CONSTRAINT tournament_matches_match_number_positive
    CHECK (match_number > 0),

  -- ── Coherencia multi-tenant ───────────────────────────────────────────
  CONSTRAINT tournament_matches_tournament_club_fk
    FOREIGN KEY (tournament_id, club_id)
    REFERENCES public.tournaments (id, club_id),

  -- ── Topología: fuentes y participantes materializados ────────────────
  CONSTRAINT tournament_matches_source_one_tournament_fk
    FOREIGN KEY (source_match_one_id, tournament_id)
    REFERENCES public.tournament_matches (id, tournament_id),
  CONSTRAINT tournament_matches_source_two_tournament_fk
    FOREIGN KEY (source_match_two_id, tournament_id)
    REFERENCES public.tournament_matches (id, tournament_id),
  CONSTRAINT tournament_matches_entry_one_tournament_fk
    FOREIGN KEY (entry_one_id, tournament_id)
    REFERENCES public.tournament_entries (id, tournament_id),
  CONSTRAINT tournament_matches_entry_two_tournament_fk
    FOREIGN KEY (entry_two_id, tournament_id)
    REFERENCES public.tournament_entries (id, tournament_id),
  CONSTRAINT tournament_matches_winner_tournament_fk
    FOREIGN KEY (winner_entry_id, tournament_id)
    REFERENCES public.tournament_entries (id, tournament_id),

  CONSTRAINT tournament_matches_distinct_sources
    CHECK (
      source_match_one_id IS NULL OR source_match_two_id IS NULL
      OR source_match_one_id <> source_match_two_id
    ),
  CONSTRAINT tournament_matches_no_self_source
    CHECK (source_match_one_id IS DISTINCT FROM id AND source_match_two_id IS DISTINCT FROM id),
  CONSTRAINT tournament_matches_distinct_entries
    CHECK (entry_one_id IS NULL OR entry_two_id IS NULL OR entry_one_id <> entry_two_id),

  -- ── Programación (opcional, dentro de una asignación) ────────────────
  CONSTRAINT tournament_matches_allocation_tournament_fk
    FOREIGN KEY (tournament_court_allocation_id, tournament_id)
    REFERENCES public.tournament_court_allocations (id, tournament_id),
  CONSTRAINT tournament_matches_allocation_court_fk
    FOREIGN KEY (tournament_court_allocation_id, court_id)
    REFERENCES public.tournament_court_allocations (id, court_id),

  -- Todo o nada: nunca una programación a medias.
  CONSTRAINT tournament_matches_schedule_atomic
    CHECK (
      (tournament_court_allocation_id IS NULL AND court_id IS NULL
        AND scheduled_date IS NULL AND scheduled_start_time IS NULL AND scheduled_end_time IS NULL)
      OR
      (tournament_court_allocation_id IS NOT NULL AND court_id IS NOT NULL
        AND scheduled_date IS NOT NULL AND scheduled_start_time IS NOT NULL AND scheduled_end_time IS NOT NULL)
    ),
  CONSTRAINT tournament_matches_schedule_window_valid
    CHECK (scheduled_start_time IS NULL OR scheduled_end_time IS NULL OR scheduled_end_time > scheduled_start_time),

  -- scheduled/in_progress/completed exigen programación completa;
  -- pending nunca la tiene; cancelled puede conservarla o no (se pudo
  -- cancelar antes o después de programarse).
  CONSTRAINT tournament_matches_status_schedule_consistency
    CHECK (
      (status IN ('scheduled', 'in_progress', 'completed') AND scheduled_date IS NOT NULL)
      OR (status = 'pending' AND scheduled_date IS NULL)
      OR (status = 'cancelled')
    ),

  -- ── MatchScore embebido — solo estructura, sin lógica deportiva ──────
  CONSTRAINT tournament_matches_set_one_atomic
    CHECK ((set_one_entry_one IS NULL) = (set_one_entry_two IS NULL)),
  CONSTRAINT tournament_matches_set_two_atomic
    CHECK ((set_two_entry_one IS NULL) = (set_two_entry_two IS NULL)),
  CONSTRAINT tournament_matches_set_three_atomic
    CHECK ((set_three_entry_one IS NULL) = (set_three_entry_two IS NULL)),
  CONSTRAINT tournament_matches_set_non_negative
    CHECK (
      COALESCE(set_one_entry_one, 0) >= 0 AND COALESCE(set_one_entry_two, 0) >= 0
      AND COALESCE(set_two_entry_one, 0) >= 0 AND COALESCE(set_two_entry_two, 0) >= 0
      AND COALESCE(set_three_entry_one, 0) >= 0 AND COALESCE(set_three_entry_two, 0) >= 0
    ),
  CONSTRAINT tournament_matches_set_not_tied
    CHECK (
      (set_one_entry_one IS NULL OR set_one_entry_one <> set_one_entry_two)
      AND (set_two_entry_one IS NULL OR set_two_entry_one <> set_two_entry_two)
      AND (set_three_entry_one IS NULL OR set_three_entry_one <> set_three_entry_two)
    ),
  CONSTRAINT tournament_matches_set_two_requires_set_one
    CHECK (set_two_entry_one IS NULL OR set_one_entry_one IS NOT NULL),
  CONSTRAINT tournament_matches_set_three_requires_set_two
    CHECK (set_three_entry_one IS NULL OR set_two_entry_one IS NOT NULL),
  CONSTRAINT tournament_matches_score_requires_entries
    CHECK (set_one_entry_one IS NULL OR (entry_one_id IS NOT NULL AND entry_two_id IS NOT NULL)),
  -- pending/scheduled nunca tienen marcador; in_progress/cancelled
  -- pueden tener marcador parcial; completed lo exige (ver más abajo).
  CONSTRAINT tournament_matches_score_only_when_allowed
    CHECK (status IN ('in_progress', 'completed', 'cancelled') OR set_one_entry_one IS NULL),

  -- ── Ganador ───────────────────────────────────────────────────────────
  CONSTRAINT tournament_matches_winner_is_participant
    CHECK (winner_entry_id IS NULL OR winner_entry_id = entry_one_id OR winner_entry_id = entry_two_id),

  -- ── Estado válido ─────────────────────────────────────────────────────
  CONSTRAINT tournament_matches_valid_status
    CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')),

  -- ── Coherencia de finalización ────────────────────────────────────────
  CONSTRAINT tournament_matches_completed_consistency
    CHECK (
      (status = 'completed' AND entry_one_id IS NOT NULL AND entry_two_id IS NOT NULL
        AND winner_entry_id IS NOT NULL AND completed_at IS NOT NULL AND completed_by IS NOT NULL
        AND set_one_entry_one IS NOT NULL)
      OR (status <> 'completed' AND winner_entry_id IS NULL AND completed_at IS NULL AND completed_by IS NULL)
    ),

  -- ── Coherencia de cancelación ─────────────────────────────────────────
  CONSTRAINT tournament_matches_cancelled_consistency
    CHECK (
      (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
      OR (status <> 'cancelled' AND cancelled_at IS NULL AND cancelled_by IS NULL)
    ),
  CONSTRAINT tournament_matches_terminal_exclusive
    CHECK (NOT (completed_at IS NOT NULL AND cancelled_at IS NOT NULL)),

  -- ── started_at ────────────────────────────────────────────────────────
  CONSTRAINT tournament_matches_started_at_consistency
    CHECK (
      (status IN ('in_progress', 'completed') AND started_at IS NOT NULL)
      OR (status IN ('pending', 'scheduled') AND started_at IS NULL)
      OR (status = 'cancelled')
    ),
  CONSTRAINT tournament_matches_started_before_completed
    CHECK (started_at IS NULL OR completed_at IS NULL OR started_at <= completed_at),
  CONSTRAINT tournament_matches_started_before_cancelled
    CHECK (started_at IS NULL OR cancelled_at IS NULL OR started_at <= cancelled_at)
);

-- Partidos de un torneo por estado (pendientes, programados, en curso,
-- completados) — por prefijo izquierdo cubre también "todos los
-- partidos del torneo".
CREATE INDEX tournament_matches_tournament_id_status_idx
  ON public.tournament_matches (tournament_id, status);

-- Programación por cancha y fecha — misma forma que
-- reservations_court_date_idx y tournament_court_allocations_court_id_
-- allocation_date_idx, para la futura detección de conflictos.
CREATE INDEX tournament_matches_court_id_scheduled_date_idx
  ON public.tournament_matches (court_id, scheduled_date);

CREATE TRIGGER set_tournament_matches_updated_at
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
