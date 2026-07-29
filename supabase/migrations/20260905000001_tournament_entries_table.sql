-- ============================================================
-- Tournament entries — cabecera histórica de una pareja inscrita
-- (Bloque 1.3, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Solo la cabecera: los dos jugadores vivirán en
-- tournament_entry_members (tabla futura, no creada aquí). Esta fila
-- representa únicamente la inscripción en sí — su categoría congelada
-- y su estado — nunca a los jugadores.
--
-- confirmed_at/confirmed_by (no approved_at/approved_by): el precedente
-- real de este proyecto para una transición "alguien resuelve una
-- solicitud" es club_join_requests (approved_at/approved_by,
-- rejected_at/rejected_by) — pero esa convención nombra las columnas
-- según el valor exacto del estado resultante. Aquí el estado resultante
-- se llama 'confirmed', no 'approved', así que aplicar la misma regla de
-- nombrado exige confirmed_at/confirmed_by — usar approved_* aquí
-- introduciría un vocabulario que no coincide con el propio valor de
-- status. Se conserva por la misma necesidad de trazabilidad que ya
-- exige withdrawn_at/withdrawn_by en esta misma tabla.
--
-- category se congela aquí aunque tournaments ya tenga su propia
-- category — es un valor histórico validado en el momento de crear la
-- inscripción, nunca recalculado; la futura función de creación
-- comparará tournament_entries.category contra tournaments.category
-- antes de insertar, no hay trigger ni CHECK cruzando tablas.
--
-- club_id se denormaliza para permitir la futura FK compuesta desde
-- tournament_entry_members, pero no lleva una FK simple propia hacia
-- clubs: la FK compuesta hacia tournaments(id, club_id) ya garantiza
-- transitivamente que club_id es real y coincide con el club del
-- torneo — una FK simple adicional sería redundante.
--
-- Ninguna transición de estado (pending→confirmed, pending/confirmed→
-- withdrawn) se protege todavía aquí: eso corresponde a funciones
-- SECURITY DEFINER y RLS sin UPDATE directo, en un bloque posterior.
-- ============================================================

CREATE TABLE public.tournament_entries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid        NOT NULL,
  club_id        uuid        NOT NULL,
  category       text        NOT NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT,
  status         text        NOT NULL DEFAULT 'pending',
  confirmed_at   timestamptz,
  confirmed_by   uuid        REFERENCES public.profiles(id),
  withdrawn_at   timestamptz,
  withdrawn_by   uuid        REFERENCES public.profiles(id),
  created_by     uuid        NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tournament_entries_id_tournament_id_key
    UNIQUE (id, tournament_id),
  CONSTRAINT tournament_entries_id_club_id_key
    UNIQUE (id, club_id),

  -- club_id denormalizado debe coincidir con el club real del torneo.
  CONSTRAINT tournament_entries_tournament_club_fk
    FOREIGN KEY (tournament_id, club_id)
    REFERENCES public.tournaments (id, club_id),

  CONSTRAINT tournament_entries_valid_status
    CHECK (status IN ('pending', 'confirmed', 'withdrawn')),

  -- pending: sin confirmación todavía. confirmed: confirmación completa
  -- y obligatoria. withdrawn: la confirmación pudo o no haber ocurrido
  -- antes del retiro (retirar desde pending vs. desde confirmed) — nunca
  -- un solo campo del par sin el otro.
  CONSTRAINT tournament_entries_confirmed_consistency
    CHECK (
      (status = 'pending' AND confirmed_at IS NULL AND confirmed_by IS NULL)
      OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
      OR (status = 'withdrawn' AND (
            (confirmed_at IS NULL AND confirmed_by IS NULL)
            OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
          ))
    ),

  CONSTRAINT tournament_entries_withdrawn_consistency
    CHECK (
      (status = 'withdrawn' AND withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL)
      OR (status <> 'withdrawn' AND withdrawn_at IS NULL AND withdrawn_by IS NULL)
    ),

  CONSTRAINT tournament_entries_confirmed_before_withdrawn
    CHECK (confirmed_at IS NULL OR withdrawn_at IS NULL OR confirmed_at <= withdrawn_at)
);

-- Cubre "todas las entradas del torneo" (prefijo izquierdo) y "entradas
-- por estado" (confirmadas para el bracket, pendientes, retiradas) en un
-- solo índice.
CREATE INDEX tournament_entries_tournament_id_status_idx
  ON public.tournament_entries (tournament_id, status);

CREATE TRIGGER set_tournament_entries_updated_at
  BEFORE UPDATE ON public.tournament_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
