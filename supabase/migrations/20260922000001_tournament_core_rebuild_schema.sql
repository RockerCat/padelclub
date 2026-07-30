-- ============================================================
-- Reconstrucción del núcleo de Torneos — esquema
-- (Bloque 1, nueva especificación funcional)
-- Mi Pádel Club
-- ============================================================
-- Mi Pádel Club deja de administrar la competencia deportiva interna del
-- torneo (partidos, rondas, llaves, canchas, marcadores) y pasa a
-- administrar únicamente el torneo como evento de club: inscripciones,
-- duplas, clasificación por puntos y su aplicación al ranking.
--
-- Decisión de producto explícita: solo existen dos torneos de prueba en
-- el entorno actual. Está autorizado eliminarlos por completo, junto con
-- todos sus datos dependientes (inscripciones, integrantes, partidos,
-- asignaciones de cancha, y cualquier movimiento de puntos que hayan
-- otorgado), para reconstruir el módulo desde cero. Esta migración ya NO
-- intenta consolidar, convertir ni preservar ningún dato histórico de
-- torneos — los intentos anteriores de consolidar movimientos de puntos
-- (por cadena de valores, y luego por fila física determinista) fueron
-- descartados por instrucción explícita; el camino elegido ahora es más
-- simple y más seguro: revertir el efecto exacto de esos puntos sobre el
-- ranking actual de cada jugador, y luego eliminar por completo los
-- movimientos y los torneos que los originaron.
--
-- Orden de esta migración:
--   1. DROP de funciones que referencian tablas a eliminar.
--   2. Reversión, en el ranking actual, de los puntos otorgados por
--      cualquier torneo existente — antes de eliminar nada. Si el
--      resultado dejaría a algún jugador con current_points negativo, la
--      migración falla aquí, explícitamente, sin eliminar información.
--   3. Eliminación de los movimientos de puntos de torneo del ledger
--      (con el trigger de inmutabilidad deshabilitado solo para esto).
--   4. Eliminación de tournament_matches / tournament_court_allocations
--      (tablas completas) y de todas las filas de tournament_entry_
--      members / tournament_entries / tournaments — en ese orden, porque
--      ninguna de las FK involucradas tiene ON DELETE CASCADE.
--   5. Validación de que la limpieza quedó completa.
--   6. Reconstrucción de esquema: rename, nuevas columnas, nuevos
--      estados/restricciones, nuevo código de evento de puntos, índice
--      único de idempotencia — todo esto opera ahora sobre tablas vacías,
--      así que ninguna de estas restricciones nuevas puede fallar por
--      datos existentes.
--   7. Validación final antes de terminar la migración.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────
-- 1. DROP — funciones que referencian tournament_matches /
--    tournament_court_allocations, o cuyo RETURNS TABLE cambia de forma
--    en la migración de funciones que sigue a esta.
-- ────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.generate_tournament_bracket(uuid);
DROP FUNCTION IF EXISTS public.create_tournament_court_allocation(uuid, uuid, date, time, time);
DROP FUNCTION IF EXISTS public.update_tournament_court_allocation(uuid, uuid, date, time, time);
DROP FUNCTION IF EXISTS public.deactivate_tournament_court_allocation(uuid);
DROP FUNCTION IF EXISTS public.schedule_tournament_match(uuid, uuid, date, time, time);
DROP FUNCTION IF EXISTS public.start_tournament_match(uuid);
DROP FUNCTION IF EXISTS public.record_tournament_match_result(uuid, integer, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.correct_tournament_match_result(uuid, integer, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.award_tournament_points(uuid);
DROP FUNCTION IF EXISTS public.get_tournament_points_summary(uuid, uuid);

DROP FUNCTION IF EXISTS public.create_tournament(
  uuid, text, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text
);
DROP FUNCTION IF EXISTS public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, timestamptz, text
);
DROP FUNCTION IF EXISTS public.open_tournament_registration(uuid);
DROP FUNCTION IF EXISTS public.close_tournament_registration(uuid);
DROP FUNCTION IF EXISTS public.cancel_tournament(uuid);
DROP FUNCTION IF EXISTS public.register_tournament_entry(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_tournament_entry(uuid);
DROP FUNCTION IF EXISTS public.withdraw_tournament_entry(uuid);


-- ────────────────────────────────────────────────────────────────────────
-- 2. Reversión, en el ranking actual, del efecto de los puntos otorgados
--    por cualquier torneo existente — antes de eliminar ningún dato.
-- ────────────────────────────────────────────────────────────────────────
-- Cualquier club_player_point_movements con tournament_id IS NOT NULL
-- pertenece, por la propia FK compuesta de la tabla, a un torneo real hoy
-- existente en `tournaments` — no hace falta unir contra esa tabla para
-- "identificar los torneos existentes": el filtro tournament_id IS NOT
-- NULL ya es exactamente equivalente.
--
-- Validación previa, sin modificar nada: si revertir la suma de esos
-- deltas dejaría a algún jugador con current_points negativo, o si algún
-- jugador con movimientos de torneo no tiene fila en
-- club_member_sport_state (no debería ocurrir — el aprovisionamiento es
-- automático — pero se verifica explícitamente en vez de asumirlo), la
-- migración falla aquí con un mensaje claro, antes de eliminar cualquier
-- información.
DO $$
DECLARE
  v_negative_count int;
  v_orphan_count   int;
BEGIN
  SELECT count(*) INTO v_orphan_count
  FROM (
    SELECT DISTINCT m.club_member_id
    FROM public.club_player_point_movements AS m
    WHERE m.tournament_id IS NOT NULL
  ) AS movers
  WHERE NOT EXISTS (
    SELECT 1 FROM public.club_member_sport_state AS s
    WHERE s.club_member_id = movers.club_member_id
  );

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot revert tournament points: % player(s) with tournament movements have no club_member_sport_state row', v_orphan_count;
  END IF;

  SELECT count(*) INTO v_negative_count
  FROM (
    SELECT s.club_member_id, s.current_points - sum(m.delta) AS resulting_points
    FROM public.club_member_sport_state AS s
    JOIN public.club_player_point_movements AS m ON m.club_member_id = s.club_member_id
    WHERE m.tournament_id IS NOT NULL
    GROUP BY s.club_member_id, s.current_points
  ) AS projected
  WHERE resulting_points < 0;

  IF v_negative_count > 0 THEN
    RAISE EXCEPTION 'Cannot revert tournament points: % player(s) would end up with negative current_points', v_negative_count;
  END IF;
END $$;

-- Reversión real — una fila por jugador afectado. points_reached_at se
-- actualiza junto con current_points, mismo patrón ya usado en cada
-- función de este módulo que modifica esta tabla.
WITH reversal AS (
  SELECT club_member_id, sum(delta)::integer AS total_delta
  FROM public.club_player_point_movements
  WHERE tournament_id IS NOT NULL
  GROUP BY club_member_id
)
UPDATE public.club_member_sport_state AS s
SET current_points = s.current_points - r.total_delta,
    points_reached_at = now()
FROM reversal AS r
WHERE s.club_member_id = r.club_member_id;


-- ────────────────────────────────────────────────────────────────────────
-- 3. Eliminación de los movimientos de puntos de torneo del ledger.
-- ────────────────────────────────────────────────────────────────────────
-- club_player_point_movements_immutable (20260822000001) bloquea UPDATE/
-- DELETE incondicionalmente en esta tabla, incluso para service_role/
-- postgres — por diseño explícito. Esta es exactamente la excepción de
-- "mantenimiento controlado de datos históricos" que ese mismo trigger
-- documenta: se deshabilita aquí, únicamente por su nombre exacto (nunca
-- DISABLE TRIGGER ALL, nunca tocando RLS ni la función), se elimina
-- exactamente lo autorizado, y se reactiva de inmediato — toda la
-- migración sigue siendo una sola transacción, así que si cualquier
-- sentencia posterior fallara, Postgres revierte también esta
-- reactivación junto con todo lo demás; no existe ningún camino de salida
-- exitoso que la deje deshabilitada.
ALTER TABLE public.club_player_point_movements
  DISABLE TRIGGER club_player_point_movements_immutable;

DELETE FROM public.club_player_point_movements
WHERE tournament_id IS NOT NULL;

ALTER TABLE public.club_player_point_movements
  ENABLE TRIGGER club_player_point_movements_immutable;


-- ────────────────────────────────────────────────────────────────────────
-- 4. Eliminación de tournament_matches / tournament_court_allocations
--    (tablas completas) y de todas las filas de tournament_entry_members
--    / tournament_entries / tournaments.
-- ────────────────────────────────────────────────────────────────────────
-- Auditoría de FKs reales (ninguna de las siguientes tiene ON DELETE
-- CASCADE — confirmado contra 20260904000001/20260905000001/
-- 20260906000001/20260907000001):
--   tournament_matches            → tournaments, tournament_entries (x3),
--                                    tournament_court_allocations, y a sí
--                                    misma (source_match_one/two).
--   tournament_court_allocations  → tournaments, courts.
--   tournament_entry_members      → tournament_entries, club_members.
--   tournament_entries            → tournaments.
-- Por eso el orden importa: tournament_matches se elimina primero (tabla
-- completa — se lleva consigo cualquier fila que bloquearía borrar
-- tournament_court_allocations o tournaments), luego tournament_court_
-- allocations (tabla completa), luego las filas de tournament_entry_
-- members (hijas de tournament_entries), luego las de tournament_entries
-- (hijas de tournaments), y solo entonces las de tournaments. Ningún
-- registro queda huérfano: cada paso elimina exactamente lo que el
-- siguiente paso necesita tener ya fuera del camino.
DROP TABLE IF EXISTS public.tournament_matches CASCADE;
DROP TABLE IF EXISTS public.tournament_court_allocations CASCADE;

DELETE FROM public.tournament_entry_members;
DELETE FROM public.tournament_entries;
DELETE FROM public.tournaments;


-- ────────────────────────────────────────────────────────────────────────
-- 5. Validación de que la limpieza quedó completa, antes de continuar con
--    la reconstrucción de esquema.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tournaments_count      int;
  v_movements_count        int;
  v_entries_count          int;
  v_entry_members_count    int;
  v_negative_points_count  int;
BEGIN
  SELECT count(*) INTO v_tournaments_count FROM public.tournaments;
  IF v_tournaments_count > 0 THEN
    RAISE EXCEPTION 'Cleanup validation failed: % row(s) remain in public.tournaments', v_tournaments_count;
  END IF;

  SELECT count(*) INTO v_movements_count
  FROM public.club_player_point_movements WHERE tournament_id IS NOT NULL;
  IF v_movements_count > 0 THEN
    RAISE EXCEPTION 'Cleanup validation failed: % club_player_point_movements row(s) with a non-null tournament_id remain', v_movements_count;
  END IF;

  SELECT count(*) INTO v_entries_count FROM public.tournament_entries;
  IF v_entries_count > 0 THEN
    RAISE EXCEPTION 'Cleanup validation failed: % row(s) remain in public.tournament_entries', v_entries_count;
  END IF;

  SELECT count(*) INTO v_entry_members_count FROM public.tournament_entry_members;
  IF v_entry_members_count > 0 THEN
    RAISE EXCEPTION 'Cleanup validation failed: % row(s) remain in public.tournament_entry_members', v_entry_members_count;
  END IF;

  SELECT count(*) INTO v_negative_points_count
  FROM public.club_member_sport_state WHERE current_points < 0;
  IF v_negative_points_count > 0 THEN
    RAISE EXCEPTION 'Cleanup validation failed: % club_member_sport_state row(s) have negative current_points', v_negative_points_count;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- 6. RECONSTRUCCIÓN DE ESQUEMA — tournaments, tournament_entries,
--    tournament_entry_members, club_player_point_movements. Todas las
--    tablas de torneos están vacías en este punto (Sección 4), así que
--    ninguna restricción nueva puede fallar por datos existentes; no se
--    necesita ningún backfill ni normalización de valores legados.
-- ────────────────────────────────────────────────────────────────────────

-- 6.1 — tournaments
-- bracket_size deja de significar "tamaño de cuadro" (potencia de 2) y
-- pasa a ser el cupo máximo de duplas de un evento — cualquier entero
-- positivo, sin restricción de bracket.
ALTER TABLE public.tournaments RENAME COLUMN bracket_size TO max_pairs;

ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_valid_bracket_size;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_max_pairs_positive CHECK (max_pairs > 0);

-- bracket_generated_at ya no tiene sentido sin bracket; DROP COLUMN se
-- lleva automáticamente su CHECK de consistencia
-- (tournaments_bracket_generated_at_consistency). Tabla vacía — sin
-- backfill que hacer primero.
ALTER TABLE public.tournaments DROP COLUMN bracket_generated_at;

ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_valid_status;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_valid_status
  CHECK (status IN (
    'draft', 'registration_open', 'registration_closed',
    'in_progress', 'completed', 'cancelled'
  ));

-- Inicio explícito del torneo ("Iniciar torneo") — registration_closed →
-- in_progress. Mismo patrón de consistencia por par de columnas ya usado
-- por completed_at/completed_by y cancelled_at/cancelled_by. Tabla vacía
-- — sin backfill que hacer primero.
ALTER TABLE public.tournaments ADD COLUMN started_at timestamptz;
ALTER TABLE public.tournaments ADD COLUMN started_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_started_consistency
  CHECK (
    (status IN ('in_progress', 'completed') AND started_at IS NOT NULL AND started_by IS NOT NULL)
    OR (status IN ('draft', 'registration_open', 'registration_closed') AND started_at IS NULL AND started_by IS NULL)
    OR (status = 'cancelled')
  );

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_started_before_completed
  CHECK (started_at IS NULL OR completed_at IS NULL OR started_at <= completed_at);

-- Campos de evento pedidos por la nueva especificación funcional:
-- premios e imagen promocional opcional. Sin bucket de Storage ni flujo
-- de subida todavía — cover_image_url es solo el campo estructural; su
-- UI de carga pertenece a un bloque posterior.
ALTER TABLE public.tournaments ADD COLUMN prize_description text;
ALTER TABLE public.tournaments ADD COLUMN cover_image_url text;


-- 6.2 — tournament_entries
-- La clasificación vive directamente en la propia inscripción — nunca una
-- tabla paralela de "puntos de torneo" distinta de "puntos de ranking":
-- el mismo valor se usa para ordenar la clasificación en vivo y, al
-- finalizar, se aplica tal cual a cada integrante final.
ALTER TABLE public.tournament_entries ADD COLUMN points integer NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_points_non_negative CHECK (points >= 0);

-- Rechazo de una solicitud pendiente — manual (con comentario del
-- organizador) o automático (cupo completado). rejection_reason es
-- siempre texto obligatorio no vacío cuando status = 'rejected': para el
-- cierre automático se guarda el valor fijo 'capacity_reached'; para el
-- rechazo manual, el comentario que escribe OWNER/ADMIN.
ALTER TABLE public.tournament_entries ADD COLUMN rejected_at timestamptz;
ALTER TABLE public.tournament_entries ADD COLUMN rejected_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.tournament_entries ADD COLUMN rejection_reason text;

ALTER TABLE public.tournament_entries DROP CONSTRAINT tournament_entries_valid_status;
ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_valid_status
  CHECK (status IN ('pending', 'confirmed', 'withdrawn', 'rejected'));

ALTER TABLE public.tournament_entries DROP CONSTRAINT tournament_entries_confirmed_consistency;
ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_confirmed_consistency
  CHECK (
    (status = 'pending' AND confirmed_at IS NULL AND confirmed_by IS NULL)
    OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
    OR (status = 'withdrawn' AND (
          (confirmed_at IS NULL AND confirmed_by IS NULL)
          OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
        ))
    OR (status = 'rejected' AND confirmed_at IS NULL AND confirmed_by IS NULL)
  );

ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_rejected_consistency
  CHECK (
    (status = 'rejected' AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL
      AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
    OR (status <> 'rejected' AND rejected_at IS NULL AND rejected_by IS NULL AND rejection_reason IS NULL)
  );


-- 6.3 — tournament_entry_members
-- El reemplazo/corrección de integrante ya no es una operación fuera de
-- alcance: se implementa como reemplazo con historial (nunca borrado
-- físico) — la fila del jugador original se marca inactiva y se inserta
-- una nueva fila activa para el jugador entrante.
ALTER TABLE public.tournament_entry_members ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.tournament_entry_members ADD COLUMN replaced_at timestamptz;
ALTER TABLE public.tournament_entry_members ADD COLUMN replaced_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.tournament_entry_members
  ADD CONSTRAINT tournament_entry_members_replaced_consistency
  CHECK (
    (is_active = true AND replaced_at IS NULL AND replaced_by IS NULL)
    OR (is_active = false AND replaced_at IS NOT NULL AND replaced_by IS NOT NULL)
  );

-- Cubre "los dos integrantes activos de una inscripción" — la consulta
-- que finalize_tournament y replace_tournament_entry_member ejecutan una
-- vez por inscripción.
CREATE INDEX tournament_entry_members_entry_id_is_active_idx
  ON public.tournament_entry_members (tournament_entry_id, is_active);


-- 6.4 — club_player_point_movements
-- Los cuatro códigos derivados del bracket (participación/campeón/
-- subcampeón/semifinalista) se reemplazan por un único código plano: la
-- nueva finalización no deriva posiciones de ningún cuadro, solo aplica
-- los puntos ya asignados manualmente a cada dupla, en partes iguales a
-- sus dos integrantes finales. Ya no existe ninguna fila con esos 4
-- códigos (Sección 3 los eliminó todos) — este ALTER no puede fallar por
-- datos existentes.
ALTER TABLE public.club_player_point_movements
  DROP CONSTRAINT club_player_point_movements_tournament_event_consistency;
ALTER TABLE public.club_player_point_movements
  DROP CONSTRAINT club_player_point_movements_category_change_id_consistency;
ALTER TABLE public.club_player_point_movements
  DROP CONSTRAINT club_player_point_movements_system_event_valid;

ALTER TABLE public.club_player_point_movements
  ADD CONSTRAINT club_player_point_movements_system_event_valid
  CHECK (
    system_event_code IS NULL OR system_event_code IN ('category_change', 'tournament_points')
  );

ALTER TABLE public.club_player_point_movements
  ADD CONSTRAINT club_player_point_movements_category_change_id_consistency
  CHECK (
    (origin = 'manual' AND category_change_id IS NULL)
    OR
    (origin = 'system' AND system_event_code = 'category_change' AND category_change_id IS NOT NULL)
    OR
    (origin = 'system' AND category_change_id IS NULL AND system_event_code = 'tournament_points')
  );

ALTER TABLE public.club_player_point_movements
  ADD CONSTRAINT club_player_point_movements_tournament_event_consistency
  CHECK (
    (tournament_id IS NOT NULL AND system_event_code = 'tournament_points')
    OR
    (tournament_id IS NULL AND (system_event_code IS NULL OR system_event_code = 'category_change'))
  );

-- Idempotencia real, garantizada por la base de datos y no solo por la
-- función que otorga los puntos: como máximo un movimiento de torneo por
-- jugador y torneo, sin importar cuántas veces se invoque
-- finalize_tournament ni bajo qué condición de carrera. No puede fallar
-- por datos existentes: cero filas tienen tournament_id NOT NULL en este
-- punto (Sección 3 + Sección 5 ya lo confirmaron).
CREATE UNIQUE INDEX club_player_point_movements_one_per_tournament_member
  ON public.club_player_point_movements (tournament_id, club_member_id)
  WHERE tournament_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────
-- 7. Validación final antes de terminar la migración.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tournaments_count     int;
  v_movements_count       int;
  v_entries_count         int;
  v_entry_members_count   int;
  v_negative_points_count int;
  v_trigger_enabled       "char";
BEGIN
  SELECT count(*) INTO v_tournaments_count FROM public.tournaments;
  IF v_tournaments_count <> 0 THEN
    RAISE EXCEPTION 'Final validation failed: public.tournaments has % row(s), expected 0', v_tournaments_count;
  END IF;

  SELECT count(*) INTO v_movements_count
  FROM public.club_player_point_movements WHERE tournament_id IS NOT NULL;
  IF v_movements_count <> 0 THEN
    RAISE EXCEPTION 'Final validation failed: % club_player_point_movements row(s) still have a non-null tournament_id', v_movements_count;
  END IF;

  SELECT count(*) INTO v_entries_count FROM public.tournament_entries;
  IF v_entries_count <> 0 THEN
    RAISE EXCEPTION 'Final validation failed: public.tournament_entries has % row(s), expected 0', v_entries_count;
  END IF;

  SELECT count(*) INTO v_entry_members_count FROM public.tournament_entry_members;
  IF v_entry_members_count <> 0 THEN
    RAISE EXCEPTION 'Final validation failed: public.tournament_entry_members has % row(s), expected 0', v_entry_members_count;
  END IF;

  SELECT count(*) INTO v_negative_points_count
  FROM public.club_member_sport_state WHERE current_points < 0;
  IF v_negative_points_count <> 0 THEN
    RAISE EXCEPTION 'Final validation failed: % club_member_sport_state row(s) have negative current_points', v_negative_points_count;
  END IF;

  SELECT tgenabled INTO v_trigger_enabled
  FROM pg_trigger
  WHERE tgname = 'club_player_point_movements_immutable'
    AND tgrelid = 'public.club_player_point_movements'::regclass;

  IF v_trigger_enabled IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'Final validation failed: club_player_point_movements_immutable trigger is not enabled (tgenabled = %)', v_trigger_enabled;
  END IF;
END $$;
