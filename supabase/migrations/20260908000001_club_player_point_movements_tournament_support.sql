-- ============================================================
-- Club player point movements — soporte estructural para torneos
-- (Bloque 1.4A, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Extensión mínima del ledger existente (20260820000001), sin crear una
-- tabla paralela de puntos de torneo y sin implementar todavía la
-- entrega real. tournament_id es nullable: todas las filas históricas
-- (manuales y de category_change) quedan válidas sin backfill.
--
-- Hallazgo de auditoría que obliga a tocar un CHECK ya existente (no
-- solo agregar uno nuevo): club_player_point_movements_category_change_
-- id_consistency, tal como está hoy, exige que TODO movimiento
-- origin='system' tenga system_event_code = 'category_change' —
-- literalmente rechazaría cualquier fila de torneo (origin='system',
-- system_event_code='tournament_participation', etc.) aunque el CHECK
-- de vocabulario (system_event_valid) ya la permitiera. Se ensancha esa
-- constraint agregando una tercera rama para el origen de torneo,
-- preservando sin cambios las dos ramas originales (manual y
-- category_change). Ningún otro CHECK existente requiere modificarse:
-- origin_reason_consistency y category_change_is_set_to_zero ya están
-- correctamente acotados a sus propios casos y son indiferentes a los
-- nuevos códigos.
--
-- Códigos habilitados: tournament_participation, tournament_champion,
-- tournament_runner_up, tournament_semifinalist — el conjunto que
-- necesitaría cualquiera de las dos políticas de entrega todavía no
-- cerradas (acumulativa vs. evento único). Ninguna combinación se
-- impone aquí: la futura función decide cuáles insertar para cada
-- jugador.
--
-- Idempotencia: el mecanismo real existente (club_player_point_
-- movements_one_per_category_change) es un índice único parcial sobre
-- una referencia a la entidad de origen (category_change_id), 1:1 por
-- diseño. Para torneos esa granularidad todavía no está cerrada (un
-- campeón podría recibir un movimiento de participación Y uno de
-- campeón bajo la política acumulativa) y tournament_entry_id/
-- tournament_match_id están explícitamente fuera de alcance de esta
-- iteración — crear un UNIQUE ahora sería inventar una llave antes de
-- que la granularidad exista. Se difiere deliberadamente: el UNIQUE de
-- idempotencia de torneo se crea junto con la función de entrega, no
-- antes.
-- ============================================================

ALTER TABLE public.club_player_point_movements
  ADD COLUMN tournament_id uuid;

-- club_id ya es NOT NULL en esta tabla; la FK compuesta garantiza que el
-- torneo referenciado pertenece al mismo club del movimiento. Sin FK
-- simple hacia tournaments(id): sería redundante frente a la compuesta.
-- Sin ON DELETE: mismo patrón histórico ya usado por cycle_id/
-- category_change_id en esta misma tabla.
ALTER TABLE public.club_player_point_movements
  ADD CONSTRAINT club_player_point_movements_tournament_club_fk
  FOREIGN KEY (tournament_id, club_id)
  REFERENCES public.tournaments (id, club_id);

-- Ensancha el vocabulario existente sin perder 'category_change'.
ALTER TABLE public.club_player_point_movements
  DROP CONSTRAINT club_player_point_movements_system_event_valid;

ALTER TABLE public.club_player_point_movements
  ADD CONSTRAINT club_player_point_movements_system_event_valid
  CHECK (
    system_event_code IS NULL OR system_event_code IN (
      'category_change',
      'tournament_participation',
      'tournament_champion',
      'tournament_runner_up',
      'tournament_semifinalist'
    )
  );

-- Agrega la tercera rama de torneo; las dos ramas originales (manual y
-- category_change) quedan idénticas a como estaban.
ALTER TABLE public.club_player_point_movements
  DROP CONSTRAINT club_player_point_movements_category_change_id_consistency;

ALTER TABLE public.club_player_point_movements
  ADD CONSTRAINT club_player_point_movements_category_change_id_consistency
  CHECK (
    (origin = 'manual' AND category_change_id IS NULL)
    OR
    (origin = 'system' AND system_event_code = 'category_change' AND category_change_id IS NOT NULL)
    OR
    (origin = 'system' AND category_change_id IS NULL AND system_event_code IN (
      'tournament_participation', 'tournament_champion',
      'tournament_runner_up', 'tournament_semifinalist'
    ))
  );

-- Coherencia local (misma fila, sin leer tournaments/tournament_entries/
-- tournament_matches): un evento de torneo siempre exige tournament_id,
-- y tournament_id nunca aparece en un evento ajeno a torneo.
ALTER TABLE public.club_player_point_movements
  ADD CONSTRAINT club_player_point_movements_tournament_event_consistency
  CHECK (
    (tournament_id IS NOT NULL AND system_event_code IN (
      'tournament_participation', 'tournament_champion',
      'tournament_runner_up', 'tournament_semifinalist'
    ))
    OR
    (tournament_id IS NULL AND (system_event_code IS NULL OR system_event_code = 'category_change'))
  );

-- Parcial: tournament_id es NULL en la inmensa mayoría de las filas
-- (manuales y de category_change) — solo indexa las que sí importan
-- para "movimientos de un torneo".
CREATE INDEX club_player_point_movements_tournament_id_idx
  ON public.club_player_point_movements (tournament_id)
  WHERE tournament_id IS NOT NULL;
