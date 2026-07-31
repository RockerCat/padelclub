-- ============================================================
-- Torneos — URL legible basada en slug (reemplaza el UUID visible)
-- Mi Pádel Club
-- ============================================================
-- Agrega tournaments.slug (único por club), generado a partir del
-- nombre del torneo. El id uuid sigue siendo la clave primaria y el
-- identificador interno real — el slug es únicamente para la URL
-- pública/administrativa; ninguna relación existente cambia.
--
-- Unicidad: (club_id, slug) — el mismo slug puede repetirse en dos
-- clubes distintos, nunca dentro del mismo club. La generación real
-- (con reintentos ante colisión, segura ante concurrencia) vive en
-- create_tournament (ver 20260925000002); esta migración solo agrega
-- la columna, la restricción de unicidad, y hace el backfill de los
-- torneos que ya existan con la misma regla determinística.
-- ============================================================

-- ─── _slugify_tournament_name ──────────────────────────────────────────
-- minúsculas → sin tildes/diacríticos (mapeo explícito, sin depender de
-- la extensión unaccent) → cualquier carácter no [a-z0-9] se colapsa en
-- un solo guion → sin guiones al inicio/fin. NULL/'' si el nombre no
-- deja ningún carácter válido (el llamador decide el fallback).
CREATE OR REPLACE FUNCTION public._slugify_tournament_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(both '-' from
      regexp_replace(
        translate(
          lower(trim(p_name)),
          'áéíóúüñàèìòùâêîôûäëïöçý',
          'aeiouunaeiouaeiouaeiocy'
        ),
        '[^a-z0-9]+', '-', 'g'
      )
    ),
    ''
  );
$$;

-- ─── Columna ────────────────────────────────────────────────────────────
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS slug text;

-- ─── Backfill de torneos existentes ──────────────────────────────────────
-- Misma regla que usará create_tournament: nombre → slug base; si ya
-- existe en el club, se le agrega la fecha (starts_at, o created_at si
-- no hay starts_at) en formato YYYYMMDD; si aún así colisiona, sufijo
-- incremental -2, -3, ... `WHERE slug IS NULL` hace este bloque seguro
-- de reintentar sin reprocesar filas ya migradas.
DO $$
DECLARE
  r RECORD;
  v_base text;
  v_candidate text;
  v_date_part text;
  v_suffix int;
BEGIN
  FOR r IN
    SELECT id, club_id, name, starts_at, created_at
    FROM public.tournaments
    WHERE slug IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    v_base := COALESCE(public._slugify_tournament_name(r.name), 'torneo');
    v_candidate := v_base;

    IF EXISTS (SELECT 1 FROM public.tournaments WHERE club_id = r.club_id AND slug = v_candidate) THEN
      v_date_part := to_char(COALESCE(r.starts_at, r.created_at), 'YYYYMMDD');
      v_candidate := v_base || '-' || v_date_part;
      v_suffix := 2;
      WHILE EXISTS (SELECT 1 FROM public.tournaments WHERE club_id = r.club_id AND slug = v_candidate) LOOP
        v_candidate := v_base || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END LOOP;
    END IF;

    UPDATE public.tournaments SET slug = v_candidate WHERE id = r.id;
  END LOOP;
END $$;

-- ─── Validación + NOT NULL + unicidad ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tournaments WHERE slug IS NULL) THEN
    RAISE EXCEPTION 'Post-backfill validation failed: some tournaments still have a NULL slug';
  END IF;
END $$;

ALTER TABLE public.tournaments ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_club_id_slug_key;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_club_id_slug_key UNIQUE (club_id, slug);
