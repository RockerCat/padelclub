-- ============================================================
-- Tournament court allocations — tabla estructural
-- (Bloque 1.3, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Solo estructura: representa una ventana concreta (cancha + fecha +
-- franja horaria) asignada a un torneo. No es un partido, no reserva por
-- sí sola ningún partido específico, y varios partidos podrán usarla
-- mientras no se solapen — esa validación de solapamiento, junto con la
-- generación de partidos, se implementa en un bloque posterior.
--
-- Modelo temporal: allocation_date + start_time + end_time, no
-- duration_minutes. reservations usa date+start_time+duration_minutes
-- porque representa una reserva de duración fija y acotada (30/60/90/120
-- min); esta tabla representa una franja amplia y variable (p. ej.
-- 8:00–18:00), semánticamente más cercana a club_pricing_rules
-- (start_time/end_time como ventana horaria) que a una reserva puntual.
-- Reutiliza los mismos tipos (date, time) y la misma convención de zona
-- horaria ya usada en todo el proyecto (interpretación implícita
-- America/Bogota, nunca un offset almacenado) — sin introducir
-- timestamptz, que no tiene precedente para horarios de club en este
-- esquema.
--
-- A diferencia de club_pricing_rules (regla recurrente, sin fecha
-- concreta, con la excepción end_time='00:00:00' para "hasta el cierre"),
-- esta tabla representa una fecha real y específica del torneo — el
-- producto no opera de noche, así que no se admite cruzar medianoche ni
-- se necesita esa excepción: end_time > start_time siempre.
--
-- FKs compuestas (nunca simples hacia tournament_id/court_id, que serían
-- redundantes: la FK compuesta ya exige que el id referenciado exista) y
-- UNIQUE(id, club_id)/UNIQUE(id, tournament_id) reutilizados de
-- tournaments/courts, sin ON DELETE — misma postura de historia
-- permanente ya aplicada a ambas tablas.
-- ============================================================

CREATE TABLE public.tournament_court_allocations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    uuid        NOT NULL,
  club_id          uuid        NOT NULL,
  court_id         uuid        NOT NULL,
  allocation_date  date        NOT NULL,
  start_time       time        NOT NULL,
  end_time         time        NOT NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        NOT NULL REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tournament_court_allocations_id_tournament_id_key
    UNIQUE (id, tournament_id),
  CONSTRAINT tournament_court_allocations_id_court_id_key
    UNIQUE (id, court_id),

  -- club_id denormalizado debe coincidir con el club real del torneo.
  CONSTRAINT tournament_court_allocations_tournament_club_fk
    FOREIGN KEY (tournament_id, club_id)
    REFERENCES public.tournaments (id, club_id),

  -- la cancha referenciada debe pertenecer al mismo club del torneo.
  CONSTRAINT tournament_court_allocations_court_club_fk
    FOREIGN KEY (court_id, club_id)
    REFERENCES public.courts (id, club_id),

  -- Sin cruce de medianoche: el producto no opera de noche, y una
  -- franja de un solo día siempre tiene un fin estrictamente posterior
  -- a su inicio.
  CONSTRAINT tournament_court_allocations_window_valid
    CHECK (end_time > start_time)
);

-- Asignaciones (activas) de un torneo — prefijo izquierdo también cubre
-- "todas las asignaciones de un torneo" sin filtrar por is_active.
CREATE INDEX tournament_court_allocations_tournament_id_is_active_idx
  ON public.tournament_court_allocations (tournament_id, is_active);

-- Ventanas de una cancha por fecha — misma forma que
-- reservations_court_date_idx, para la futura detección de conflictos.
CREATE INDEX tournament_court_allocations_court_id_allocation_date_idx
  ON public.tournament_court_allocations (court_id, allocation_date);

CREATE TRIGGER set_tournament_court_allocations_updated_at
  BEFORE UPDATE ON public.tournament_court_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
