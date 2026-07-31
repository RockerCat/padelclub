-- ============================================================
-- Noticias — URL legible basada en slug (reemplaza el UUID visible)
-- Mi Pádel Club
-- ============================================================
-- Mismo patrón ya usado por tournaments (20260925000001): slug único
-- por club, id uuid sigue siendo la clave primaria y el identificador
-- interno real. Reutiliza _slugify_tournament_name (genérica pese al
-- nombre — un simple texto→slug sin nada específico de torneos, ver
-- 20260925000001) en vez de duplicar la utilidad.
--
-- Unicidad: (club_id, slug) — el mismo slug puede repetirse en dos
-- clubes distintos, nunca dentro del mismo club. La generación real
-- (con reintentos ante colisión, segura ante concurrencia) vive en
-- create_club_news (ver 20261001000002); esta migración solo agrega la
-- columna, la restricción de unicidad, y el backfill de las noticias
-- que ya existan con la misma regla determinística.
--
-- Reintentable: ADD COLUMN IF NOT EXISTS, el backfill solo toca
-- `WHERE slug IS NULL`, y la restricción se recrea con DROP IF EXISTS
-- antes del ADD.
-- ============================================================

ALTER TABLE public.club_news ADD COLUMN IF NOT EXISTS slug text;

-- ─── Backfill de noticias existentes ─────────────────────────────────────
-- título → slug base; si ya existe en el club, se le agrega la fecha de
-- publicación (published_at) en formato YYYYMMDD; si aún así colisiona,
-- sufijo incremental -2, -3, ...
DO $$
DECLARE
  r RECORD;
  v_base text;
  v_candidate text;
  v_date_part text;
  v_suffix int;
BEGIN
  FOR r IN
    SELECT id, club_id, title, published_at
    FROM public.club_news
    WHERE slug IS NULL
    ORDER BY published_at ASC, id ASC
  LOOP
    v_base := COALESCE(public._slugify_tournament_name(r.title), 'noticia');
    v_candidate := v_base;

    IF EXISTS (SELECT 1 FROM public.club_news WHERE club_id = r.club_id AND slug = v_candidate) THEN
      v_date_part := to_char(r.published_at, 'YYYYMMDD');
      v_candidate := v_base || '-' || v_date_part;
      v_suffix := 2;
      WHILE EXISTS (SELECT 1 FROM public.club_news WHERE club_id = r.club_id AND slug = v_candidate) LOOP
        v_candidate := v_base || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END LOOP;
    END IF;

    UPDATE public.club_news SET slug = v_candidate WHERE id = r.id;
  END LOOP;
END $$;

-- ─── Validación + NOT NULL + unicidad ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_news WHERE slug IS NULL) THEN
    RAISE EXCEPTION 'Post-backfill validation failed: some club_news rows still have a NULL slug';
  END IF;
END $$;

ALTER TABLE public.club_news ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.club_news DROP CONSTRAINT IF EXISTS club_news_club_id_slug_key;
ALTER TABLE public.club_news ADD CONSTRAINT club_news_club_id_slug_key UNIQUE (club_id, slug);
