-- ============================================================
-- Noticias — create_club_news: publicación con slug único y seguro
-- ante concurrencia
-- Mi Pádel Club
-- ============================================================
-- Hasta ahora createNews hacía un INSERT directo desde el cliente
-- autenticado (protegido solo por RLS). Para generar el slug de forma
-- segura ante carrera (dos pestañas publicando casi al mismo tiempo)
-- hace falta el mismo patrón ya probado en create_tournament
-- (20260925000002): reintentar el INSERT real contra el índice único
-- (club_id, slug) cuando colisiona — nunca "SELECT para ver si está
-- libre" seguido de un INSERT separado, que sí tiene una carrera real.
-- Eso solo es practicable dentro de un RPC, así que create_club_news
-- reemplaza el INSERT directo de createNews sin cambiar ninguna validación
-- observable: título ≥3 caracteres, contenido obligatorio, imagen
-- obligatoria, solo OWNER/ADMIN del club — las mismas reglas que ya
-- vivían en el server action, ahora también reforzadas en el propio RPC.
--
-- tournament_id conserva exactamente las mismas reglas agregadas en
-- 20260929000001 (torneo debe pertenecer al mismo club y estar
-- completed, una sola noticia por torneo) — antes vivían solo en la
-- policy de INSERT y en el server action; ahora también se validan aquí
-- explícitamente, con mensajes de negocio propios en vez de depender
-- únicamente del error crudo de la policy/el índice único.
CREATE OR REPLACE FUNCTION public.create_club_news(
  p_club_id       uuid,
  p_title         text,
  p_content       text,
  p_image_url     text,
  p_tournament_id uuid
)
RETURNS TABLE (
  id            uuid,
  club_id       uuid,
  title         text,
  slug          text,
  content       text,
  image_url     text,
  created_by    uuid,
  tournament_id uuid,
  published_at  timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_title          text;
  v_content        text;
  v_image_url      text;
  v_tournament     public.tournaments%ROWTYPE;
  v_base_slug      text;
  v_candidate_slug text;
  v_date_part      text;
  v_suffix         int := 0;
  v_constraint     text;
  v_news           public.club_news%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to publish news for this club' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to publish news for this club' USING ERRCODE = '42501';
  END IF;

  v_title := btrim(COALESCE(p_title, ''));
  IF length(v_title) < 3 THEN
    RAISE EXCEPTION 'Title must be at least 3 characters' USING ERRCODE = '22023';
  END IF;

  v_content := btrim(COALESCE(p_content, ''));
  IF v_content = '' THEN
    RAISE EXCEPTION 'Content is required' USING ERRCODE = '22023';
  END IF;

  v_image_url := btrim(COALESCE(p_image_url, ''));
  IF v_image_url = '' THEN
    RAISE EXCEPTION 'Image is required' USING ERRCODE = '22023';
  END IF;

  -- tournament_id — nunca se confía en el valor recibido tal cual: debe
  -- existir, pertenecer a este mismo club, estar completed, y no tener
  -- ya una noticia asociada (mismo trío de reglas que la policy RLS de
  -- INSERT, ahora también explícito aquí con mensajes propios).
  IF p_tournament_id IS NOT NULL THEN
    SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id AND t.club_id = p_club_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tournament not found for this club' USING ERRCODE = 'P0002';
    END IF;
    IF v_tournament.status <> 'completed' THEN
      RAISE EXCEPTION 'Tournament must be completed to generate its news' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.club_news WHERE tournament_id = p_tournament_id) THEN
      RAISE EXCEPTION 'This tournament already has a published news item' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Slug: intento real de INSERT por iteración (mismo patrón que
  -- create_tournament) — el índice único (club_id, slug) es la única
  -- fuente de verdad, incluso bajo carrera.
  v_base_slug := COALESCE(public._slugify_tournament_name(v_title), 'noticia');
  v_candidate_slug := v_base_slug;

  LOOP
    BEGIN
      INSERT INTO public.club_news AS cn (club_id, title, slug, content, image_url, created_by, tournament_id)
      VALUES (p_club_id, v_title, v_candidate_slug, v_content, v_image_url, auth.uid(), p_tournament_id)
      RETURNING * INTO v_news;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      IF v_constraint = 'club_news_one_per_tournament' THEN
        RAISE EXCEPTION 'This tournament already has a published news item' USING ERRCODE = '22023';
      END IF;
      IF v_constraint <> 'club_news_club_id_slug_key' THEN
        RAISE;
      END IF;

      IF v_suffix = 0 THEN
        v_date_part := to_char(now(), 'YYYYMMDD');
        v_candidate_slug := v_base_slug || '-' || v_date_part;
        v_suffix := 2;
      ELSE
        v_candidate_slug := v_base_slug || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END IF;

      IF v_suffix > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique news slug after multiple attempts' USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT
    v_news.id, v_news.club_id, v_news.title, v_news.slug, v_news.content, v_news.image_url,
    v_news.created_by, v_news.tournament_id, v_news.published_at, v_news.created_at, v_news.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_news(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_news(uuid, text, text, text, uuid) TO authenticated;
