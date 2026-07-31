-- ============================================================
-- Torneos — portada editable en cualquier estado del torneo
-- Mi Pádel Club
-- ============================================================
-- Causa: update_tournament sigue bloqueado fuera de draft/
-- registration_open/registration_closed ("Tournament is not in an
-- editable state") — correcto para nombre, fechas, categoría, cupo,
-- etc., pero eso también dejaba la portada sin poder cambiarse una vez
-- el torneo pasaba a in_progress/completed/cancelled.
--
-- Nueva regla: la portada (cover_image_url) es editable por OWNER/ADMIN
-- en CUALQUIER estado — nunca reabre el torneo, nunca toca resultados,
-- puntos, participantes ni ninguna otra configuración. Se implementa
-- como un RPC nuevo, dedicado exclusivamente a esta columna, en vez de
-- debilitar el gate de estado de update_tournament (que sigue
-- protegiendo exactamente igual a todos los demás campos).
CREATE OR REPLACE FUNCTION public.update_tournament_cover_image(
  p_tournament_id   uuid,
  p_cover_image_url text
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
  v_caller_member public.club_members%ROWTYPE;
  v_tournament     public.tournaments%ROWTYPE;
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

  -- Deliberadamente SIN chequeo de v_tournament.status: a diferencia de
  -- update_tournament, la portada se puede reemplazar en draft,
  -- registration_open, registration_closed, in_progress, completed o
  -- cancelled — nunca reabre el torneo ni toca ningún otro campo.
  UPDATE public.tournaments AS t
  SET cover_image_url = NULLIF(btrim(COALESCE(p_cover_image_url, '')), '')
  WHERE t.id = p_tournament_id;

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

REVOKE ALL ON FUNCTION public.update_tournament_cover_image(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tournament_cover_image(uuid, text) TO authenticated;
