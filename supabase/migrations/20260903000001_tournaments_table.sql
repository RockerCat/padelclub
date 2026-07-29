-- ============================================================
-- Tournaments — tabla estructural (Bloque 1.3, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Solo estructura: columnas, constraints locales, FKs, UNIQUE(id, club_id)
-- e índice mínimo. Ninguna tabla hija, función, trigger de negocio ni
-- política RLS se crea aquí — eso queda para iteraciones posteriores.
--
-- club_id no usa ON DELETE CASCADE: mismo patrón ya usado por
-- reservations/club_ranking_cycles/club_player_point_movements (datos
-- históricos, nunca desechables junto con el club) — un club nunca se
-- borra físicamente de todas formas, solo se archiva.
--
-- category reutiliza la convención exacta del módulo deportivo:
-- referencia sport_categories(code) directamente, ON DELETE RESTRICT,
-- igual que club_ranking_cycles.category.
--
-- created_by/completed_by/cancelled_by referencian profiles(id) sin
-- ON DELETE, igual que reservations.created_by/cancelled_by/rejected_by.
-- ============================================================

CREATE TABLE public.tournaments (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                 uuid        NOT NULL REFERENCES public.clubs(id),
  name                    text        NOT NULL,
  description             text,
  category                text        NOT NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT,
  bracket_size            integer     NOT NULL,
  status                  text        NOT NULL DEFAULT 'draft',
  visibility              text        NOT NULL DEFAULT 'private',
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid        REFERENCES public.profiles(id),
  cancelled_at            timestamptz,
  cancelled_by            uuid        REFERENCES public.profiles(id),
  created_by              uuid        NOT NULL REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tournaments_id_club_id_key UNIQUE (id, club_id),

  CONSTRAINT tournaments_name_not_blank
    CHECK (btrim(name) <> ''),

  CONSTRAINT tournaments_valid_bracket_size
    CHECK (bracket_size IN (4, 8, 16)),

  CONSTRAINT tournaments_valid_status
    CHECK (status IN (
      'draft', 'registration_open', 'registration_closed',
      'bracket_generated', 'in_progress', 'completed', 'cancelled'
    )),

  CONSTRAINT tournaments_valid_visibility
    CHECK (visibility IN ('public', 'private')),

  -- Solo cuando ambos valores existen — ninguna de las dos columnas es
  -- obligatoria mientras el torneo sigue en draft.
  CONSTRAINT tournaments_registration_window_valid
    CHECK (
      registration_opens_at IS NULL OR registration_closes_at IS NULL
      OR registration_opens_at < registration_closes_at
    ),

  CONSTRAINT tournaments_event_window_valid
    CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at),

  CONSTRAINT tournaments_registration_before_start
    CHECK (
      registration_closes_at IS NULL OR starts_at IS NULL
      OR registration_closes_at <= starts_at
    ),

  -- Exigido en bracket_generated/in_progress/completed; nulo antes de
  -- generarse; libre en cancelled (un torneo puede cancelarse antes o
  -- después de tener cuadro).
  CONSTRAINT tournaments_bracket_generated_at_consistency
    CHECK (
      (status IN ('bracket_generated', 'in_progress', 'completed') AND bracket_generated_at IS NOT NULL)
      OR (status IN ('draft', 'registration_open', 'registration_closed') AND bracket_generated_at IS NULL)
      OR (status = 'cancelled')
    ),

  CONSTRAINT tournaments_completed_consistency
    CHECK (
      (status = 'completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
      OR (status <> 'completed' AND completed_at IS NULL AND completed_by IS NULL)
    ),

  CONSTRAINT tournaments_cancelled_consistency
    CHECK (
      (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
      OR (status <> 'cancelled' AND cancelled_at IS NULL AND cancelled_by IS NULL)
    ),

  CONSTRAINT tournaments_terminal_exclusive
    CHECK (NOT (completed_at IS NOT NULL AND cancelled_at IS NOT NULL))
);

-- Sirve tanto "torneos de un club" (prefijo izquierdo) como "torneos de un
-- club por estado" (match completo) — una sola consulta cubre ambos casos
-- de la Sección 7. Sin índices por visibility/starts_at: todavía no existe
-- ninguna consulta real (RPC/página) que los necesite en este bloque.
CREATE INDEX tournaments_club_id_status_idx ON public.tournaments (club_id, status);

CREATE TRIGGER set_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
