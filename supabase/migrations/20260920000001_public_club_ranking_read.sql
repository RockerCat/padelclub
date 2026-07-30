-- ============================================================
-- Ranking público del club — Bloque 3.2–3.3 (módulo deportivo)
-- Mi Pádel Club
-- ============================================================
-- Gap real, confirmado en 20260824000001: get_club_category_ranking exige
-- incondicionalmente auth.uid() IS NOT NULL + is_club_member(p_club_id),
-- sin ninguna rama para clubs.visibility = 'public'. Esto bloquea por
-- completo la regla de negocio pedida ("ranking visible para cualquier
-- visitante de un club público, con o sin sesión").
--
-- Cambio mínimo, retrocompatible, sobre la función YA existente (no se
-- crea una segunda RPC pública — la firma y las 7 columnas de
-- get_club_category_ranking quedan idénticas, así que
-- change_club_player_category, que ya la invoca internamente
-- (20260822000001/20260823000001), sigue funcionando sin cambios: ese
-- caller siempre actúa en nombre de un OWNER/ADMIN ya autorizado, que ya
-- era y sigue siendo miembro activo del club):
--
--   Antes:  auth.uid() IS NOT NULL  AND  is_club_member(p_club_id)
--   Ahora:  is_club_member(p_club_id)
--           OR (club activo, visibility = 'public' Y archived_at IS NULL)
--
-- Un club archivado nunca entra por la rama pública (mismo criterio que
-- "removes the club from public discovery and its public profile",
-- CLAUDE.md → Club Archival Principles) — pero un miembro activo sigue
-- viendo el ranking de su propio club archivado exactamente igual que
-- antes, porque is_club_member() por sí solo ya lo autoriza.
--
-- get_club_category_ranking_view no se recrea: su cuerpo compone la
-- función de abajo sin duplicar autorización (ver 20260824000001) — hereda
-- este cambio automáticamente. Solo se le agrega el GRANT a anon.
--
-- Ninguna mutación (adjust_club_player_points, change_club_player_category)
-- se toca en este archivo — siguen exigiendo autenticación + rol OWNER/
-- ADMIN exactamente como antes. Ningún GRANT de escritura se concede a
-- anon en ningún punto de esta migración.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_club_category_ranking(
  p_club_id  uuid,
  p_category text
)
RETURNS TABLE (
  ranking_position  bigint,
  club_member_id    uuid,
  profile_id        uuid,
  full_name         text,
  category          text,
  current_points    integer,
  points_reached_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_is_active   boolean;
  v_visibility  text;
  v_archived_at timestamptz;
BEGIN
  SELECT c.is_active, c.visibility, c.archived_at
    INTO v_is_active, v_visibility, v_archived_at
  FROM public.clubs c
  WHERE c.id = p_club_id;

  -- Mismo criterio de "no encontrado" que cualquier otra resolución de
  -- club en este proyecto (.eq("is_active", true) en cada consulta desde
  -- el frontend) — un club inactivo se trata como inexistente para
  -- cualquier llamador, miembro o no.
  IF NOT FOUND OR NOT v_is_active THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_visibility = 'public' AND v_archived_at IS NULL) AND NOT public.is_club_member(p_club_id) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Not authorized to view this club''s ranking' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    RANK() OVER (
      ORDER BY s.current_points DESC, s.points_reached_at ASC, s.club_member_id ASC
    ) AS ranking_position,
    s.club_member_id,
    cm.profile_id,
    p.full_name,
    c.category,
    s.current_points,
    s.points_reached_at
  FROM public.club_member_sport_state s
  JOIN public.club_ranking_cycles c ON c.id = s.cycle_id AND c.ended_at IS NULL
  JOIN public.club_members cm ON cm.id = s.club_member_id AND cm.club_id = s.club_id
  JOIN public.profiles p ON p.id = cm.profile_id
  WHERE s.club_id = p_club_id
    AND c.category = p_category
    AND cm.role = 'PLAYER'
    AND cm.is_active = true
  ORDER BY ranking_position;
END;
$$;

-- REVOKE ALL FROM PUBLIC ya aplicado en 20260824000001 y persiste a través
-- de CREATE OR REPLACE FUNCTION (no resetea grants) — solo se agrega el
-- GRANT incremental a anon; el GRANT a authenticated ya existente también
-- persiste sin necesidad de repetirlo.
GRANT EXECUTE ON FUNCTION public.get_club_category_ranking(uuid, text) TO anon;

-- get_club_category_ranking_view no se recrea (su cuerpo no cambia: sigue
-- componiendo la función de arriba sin duplicar autorización) — solo
-- necesita el mismo GRANT incremental a anon para que la vista de
-- ranking público (la que de verdad consume la UI) funcione para
-- visitantes anónimos de un club público.
GRANT EXECUTE ON FUNCTION public.get_club_category_ranking_view(uuid, text) TO anon;
