-- ============================================================
-- Tournament entry members — jugadores de una pareja inscrita
-- (Bloque 1.3, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Tabla hija de tournament_entries: una fila por jugador de la pareja.
-- Estructuralmente inmutable — no cambia de inscripción, torneo, club ni
-- jugador una vez creada; no existe status ni is_active propios, y no se
-- duplica ningún dato de tournament_entries.status, que sigue siendo la
-- única fuente de verdad sobre la actividad de la inscripción.
--
-- Sin ON DELETE CASCADE hacia tournament_entries (a diferencia de
-- reservation_players → reservations): el módulo de Torneos decidió no
-- permitir borrado físico de inscripciones, y esa garantía se refuerza
-- también a nivel relacional — eliminar una cabecera con miembros
-- existentes queda bloqueado por la ausencia de cláusula, en vez de
-- permitir que se arrastren en cascada.
--
-- tournament_id y club_id se denormalizan únicamente para permitir las
-- FKs compuestas hacia tournament_entries y club_members — ninguna FK
-- simple adicional hacia tournament_entries/tournaments/clubs/
-- club_members, porque las tres FKs compuestas ya garantizan esas
-- relaciones transitivamente.
--
-- No se implementa aquí "exactamente dos jugadores por inscripción" ni
-- "jugador único en inscripción activa por torneo" — ambas reglas
-- dependen de más de una fila o del estado de la tabla padre, y quedan
-- para la función transaccional con advisory locks de un bloque
-- posterior.
-- ============================================================

CREATE TABLE public.tournament_entry_members (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_entry_id uuid       NOT NULL,
  tournament_id      uuid        NOT NULL,
  club_id            uuid        NOT NULL,
  club_member_id     uuid        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- tournament_id denormalizado debe coincidir con el de la inscripción real.
  CONSTRAINT tournament_entry_members_entry_tournament_fk
    FOREIGN KEY (tournament_entry_id, tournament_id)
    REFERENCES public.tournament_entries (id, tournament_id),

  -- club_id denormalizado debe coincidir con el de la inscripción real.
  CONSTRAINT tournament_entry_members_entry_club_fk
    FOREIGN KEY (tournament_entry_id, club_id)
    REFERENCES public.tournament_entries (id, club_id),

  -- el jugador debe pertenecer realmente al club de la inscripción.
  CONSTRAINT tournament_entry_members_member_club_fk
    FOREIGN KEY (club_member_id, club_id)
    REFERENCES public.club_members (id, club_id),

  -- protege únicamente "no el mismo jugador dos veces en la MISMA
  -- inscripción" — nunca "jugador único en todo el torneo", que depende
  -- del status del padre y no es expresable de forma declarativa.
  CONSTRAINT tournament_entry_members_entry_member_key
    UNIQUE (tournament_entry_id, club_member_id)
);

-- Cubre la futura consulta de concurrencia bajo advisory lock
-- (WHERE tournament_id = ? AND club_member_id IN (?, ?)) y, por prefijo
-- izquierdo, "todos los miembros de un torneo". No se agrega un segundo
-- índice solo por club_member_id: no existe todavía una consulta
-- histórica global por jugador que lo justifique.
CREATE INDEX tournament_entry_members_tournament_id_club_member_id_idx
  ON public.tournament_entry_members (tournament_id, club_member_id);
