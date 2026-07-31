-- ============================================================
-- Torneos — permite editar max_pairs con inscripciones abiertas,
-- validado contra la cantidad real de duplas activas
-- Mi Pádel Club
-- ============================================================
-- Causa de la restricción actual: update_tournament congelaba max_pairs
-- por completo en cuanto status pasaba a registration_open/
-- registration_closed (junto con category/secondary_category/
-- registration_opens_at) — un bloqueo absoluto, sin relación con cuántas
-- duplas hubiera realmente inscritas.
--
-- Nueva regla: max_pairs deja de estar en esa lista de campos congelados
-- y en su lugar se valida contra tournament_entries en la misma
-- transacción — nunca contra un contador de UI. "Dupla activa" = status
-- IN ('pending', 'confirmed'); withdrawn/rejected nunca cuentan (misma
-- semántica ya usada por summarizeCapacity/capacity.occupied en el
-- frontend — nunca una segunda definición). category/secondary_category/
-- registration_opens_at siguen exactamente igual de congelados que antes
-- — este cambio es exclusivo de max_pairs.
--
-- Concurrencia: sin bloqueo adicional — la función ya adquiere
-- `SELECT ... FOR UPDATE` sobre la fila de tournaments al inicio, y
-- register_tournament_entry adquiere ese mismo lock antes de contar/
-- insertar una nueva dupla. Dos transacciones que compitan por la misma
-- fila de tournaments ya se serializan por ese mecanismo existente — el
-- COUNT de aquí siempre ve un snapshot consistente con cualquier
-- inscripción concurrente ya resuelta o esperando el mismo lock.
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
  updated_at                  timestamptz
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

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;

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

  IF p_max_pairs IS NULL OR p_max_pairs < 1 THEN
    RAISE EXCEPTION 'Invalid max pairs' USING ERRCODE = '22023';
  END IF;

  -- Nueva regla: max_pairs puede cambiar con inscripciones abiertas o
  -- cerradas (ya no está en la lista de campos congelados de arriba),
  -- pero nunca por debajo de las duplas activas ya inscritas. Se calcula
  -- aquí, dentro de la misma transacción que ya tiene la fila de
  -- tournaments bloqueada — nunca confiando en un contador de UI.
  IF p_max_pairs IS DISTINCT FROM v_tournament.max_pairs THEN
    SELECT count(*) INTO v_active_entries_count
    FROM public.tournament_entries AS te
    WHERE te.tournament_id = p_tournament_id AND te.status IN ('pending', 'confirmed');

    IF p_max_pairs < v_active_entries_count THEN
      RAISE EXCEPTION 'max_pairs cannot be less than the number of active tournament entries' USING ERRCODE = '22023';
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
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, integer, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, integer, text, text, text
) TO authenticated;
