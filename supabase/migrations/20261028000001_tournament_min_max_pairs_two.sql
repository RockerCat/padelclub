-- ============================================================
-- Cupo mínimo de un torneo: al menos 2 duplas
-- Mi Pádel Club
-- ============================================================
-- Único cambio de negocio: p_max_pairs < 1 → p_max_pairs < 2. El mensaje
-- RAISE ('Invalid max pairs') se deja intacto a propósito — es el string
-- técnico que src/app/(app)/[club]/admin/tournaments/actions.ts ya
-- reconoce (msg.includes("Invalid max pairs")) para traducirlo; ese
-- archivo es el que se actualiza para mostrar "Un torneo debe permitir
-- al menos 2 duplas." — igual que el resto de mensajes de este módulo,
-- nunca se traduce dentro del RPC. Body de ambas funciones copiado byte
-- a byte de su
-- definición vigente más reciente
-- (20261021000001_tournament_lifecycle_archive_columns.sql, que ya
-- incluye archived_at/archived_by en RETURNS TABLE y el fix de columna
-- ambigua "club_id" en update_tournament) — ninguna otra línea cambia:
-- misma firma de entrada, mismo RETURNS TABLE (27 columnas, sin cambio
-- de tipo de retorno → CREATE OR REPLACE basta, sin DROP FUNCTION),
-- misma autorización, mismas validaciones restantes (nombre, categorías,
-- visibilidad, duración estimada, fechas), misma regla independiente de
-- "max_pairs no puede bajar de las duplas activas" en update_tournament,
-- mismos grants (ya existentes, preservados por CREATE OR REPLACE).
-- ============================================================

-- ─── create_tournament ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tournament(
  p_club_id                     uuid,
  p_name                        text,
  p_category                    text,
  p_max_pairs                   integer,
  p_description                 text DEFAULT NULL,
  p_visibility                  text DEFAULT 'private',
  p_registration_opens_at       timestamptz DEFAULT NULL,
  p_registration_closes_at      timestamptz DEFAULT NULL,
  p_starts_at                   timestamptz DEFAULT NULL,
  p_estimated_duration_minutes  integer DEFAULT NULL,
  p_secondary_category          text DEFAULT NULL,
  p_prize_description           text DEFAULT NULL,
  p_cover_image_url             text DEFAULT NULL
)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  archived_at                 timestamptz,
  archived_by                 uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_name           text;
  v_description    text;
  v_prize          text;
  v_tournament     public.tournaments%ROWTYPE;
  v_primary_sort   smallint;
  v_secondary_sort smallint;
  v_base_slug      text;
  v_candidate_slug text;
  v_date_part      text;
  v_suffix         int := 0;
  v_constraint     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, p_club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(p_club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members AS cm2
        WHERE cm2.club_id = p_club_id AND cm2.profile_id = auth.uid() AND cm2.is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tournament name cannot be blank' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_prize := NULLIF(btrim(COALESCE(p_prize_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  IF p_secondary_category IS NOT NULL THEN
    IF p_secondary_category = p_category THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    SELECT sort_order INTO v_primary_sort FROM public.sport_categories WHERE code = p_category;
    SELECT sort_order INTO v_secondary_sort FROM public.sport_categories WHERE code = p_secondary_category;

    IF v_secondary_sort IS NULL OR v_primary_sort <= v_secondary_sort THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_max_pairs IS NULL OR p_max_pairs < 2 THEN
    RAISE EXCEPTION 'Invalid max pairs' USING ERRCODE = '22023';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_duration_minutes IS NOT NULL AND p_estimated_duration_minutes < 1 THEN
    RAISE EXCEPTION 'Invalid estimated duration' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  v_base_slug := COALESCE(public._slugify_tournament_name(v_name), 'torneo');
  v_candidate_slug := v_base_slug;

  LOOP
    BEGIN
      INSERT INTO public.tournaments (
        club_id, name, slug, description, category, secondary_category, max_pairs, visibility,
        registration_opens_at, registration_closes_at, starts_at, estimated_duration_minutes,
        prize_description, cover_image_url, created_by
      ) VALUES (
        p_club_id, v_name, v_candidate_slug, v_description, p_category, p_secondary_category, p_max_pairs, p_visibility,
        p_registration_opens_at, p_registration_closes_at, p_starts_at, p_estimated_duration_minutes,
        v_prize, NULLIF(btrim(COALESCE(p_cover_image_url, '')), ''), auth.uid()
      )
      RETURNING * INTO v_tournament;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'tournaments_club_id_slug_key' THEN
        RAISE;
      END IF;

      IF v_suffix = 0 THEN
        v_date_part := to_char(COALESCE(p_starts_at, now()), 'YYYYMMDD');
        v_candidate_slug := v_base_slug || '-' || v_date_part;
        v_suffix := 2;
      ELSE
        v_candidate_slug := v_base_slug || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END IF;

      IF v_suffix > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique tournament slug after multiple attempts' USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at,
    v_tournament.archived_at, v_tournament.archived_by;
END;
$$;


-- ─── update_tournament ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_tournament(
  p_tournament_id               uuid,
  p_name                        text,
  p_description                 text,
  p_category                    text,
  p_max_pairs                   integer,
  p_visibility                  text,
  p_registration_opens_at       timestamptz,
  p_registration_closes_at      timestamptz,
  p_starts_at                   timestamptz,
  p_estimated_duration_minutes  integer,
  p_secondary_category          text,
  p_prize_description           text,
  p_cover_image_url             text
)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  archived_at                 timestamptz,
  archived_by                 uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member       public.club_members%ROWTYPE;
  v_tournament           public.tournaments%ROWTYPE;
  v_name                 text;
  v_description          text;
  v_prize                text;
  v_updated_count        int;
  v_primary_sort         smallint;
  v_secondary_sort       smallint;
  v_active_entries_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members AS cm2
        WHERE cm2.club_id = v_tournament.club_id AND cm2.profile_id = auth.uid() AND cm2.is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status NOT IN ('draft', 'registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not in an editable state' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status IN ('registration_open', 'registration_closed') THEN
    IF p_category IS DISTINCT FROM v_tournament.category THEN
      RAISE EXCEPTION 'category cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
    IF p_secondary_category IS DISTINCT FROM v_tournament.secondary_category THEN
      RAISE EXCEPTION 'secondary_category cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
    IF p_registration_opens_at IS DISTINCT FROM v_tournament.registration_opens_at THEN
      RAISE EXCEPTION 'registration_opens_at cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tournament name cannot be blank' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_prize := NULLIF(btrim(COALESCE(p_prize_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  IF p_secondary_category IS NOT NULL THEN
    IF p_secondary_category = p_category THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    SELECT sort_order INTO v_primary_sort FROM public.sport_categories WHERE code = p_category;
    SELECT sort_order INTO v_secondary_sort FROM public.sport_categories WHERE code = p_secondary_category;

    IF v_secondary_sort IS NULL OR v_primary_sort <= v_secondary_sort THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_max_pairs IS NULL OR p_max_pairs < 2 THEN
    RAISE EXCEPTION 'Invalid max pairs' USING ERRCODE = '22023';
  END IF;

  IF p_max_pairs IS DISTINCT FROM v_tournament.max_pairs THEN
    SELECT count(*) INTO v_active_entries_count
    FROM public.tournament_entries AS te
    WHERE te.tournament_id = p_tournament_id AND te.status IN ('pending', 'confirmed');

    IF p_max_pairs < v_active_entries_count THEN
      RAISE EXCEPTION 'max_pairs cannot be less than % active tournament entries', v_active_entries_count
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_duration_minutes IS NOT NULL AND p_estimated_duration_minutes < 1 THEN
    RAISE EXCEPTION 'Invalid estimated duration' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET name = v_name,
      description = v_description,
      category = p_category,
      secondary_category = p_secondary_category,
      max_pairs = p_max_pairs,
      visibility = p_visibility,
      registration_opens_at = p_registration_opens_at,
      registration_closes_at = p_registration_closes_at,
      starts_at = p_starts_at,
      estimated_duration_minutes = p_estimated_duration_minutes,
      prize_description = v_prize,
      cover_image_url = NULLIF(btrim(COALESCE(p_cover_image_url, '')), '')
  WHERE t.id = p_tournament_id AND t.status = v_tournament.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at,
    v_tournament.archived_at, v_tournament.archived_by;
END;
$$;
