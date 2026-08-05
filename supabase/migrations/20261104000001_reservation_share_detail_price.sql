-- ============================================================
-- Detalle de reserva compartido — el jugador no podía abrir el detalle de
-- su propia reserva PENDIENTE (creador de una solicitud aún no aprobada)
-- ni desde el calendario ni desde "Mis solicitudes": ambas superficies
-- solo enlazaban a esta página para reservas confirmadas. La página en sí
-- (get_reservation_share_detail) ya no filtra por status y ya soporta
-- pending — el bug era puramente de navegación en el frontend.
--
-- Al habilitar la vista de una pendiente, el detalle debe poder mostrar su
-- valor ("cancha, fecha, hora, duración, valor y creador") — un dato que
-- get_reservation_share_detail nunca exponía. Carencia real e
-- indispensable para cumplir ese requisito: se agrega price_amount/
-- price_currency al jsonb de salida. Ninguna otra columna, regla de
-- autorización ni firma cambia.
-- Mi Pádel Club
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_reservation_share_detail(p_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation  public.reservations;
  v_role         text;
  v_result       jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.club_role(v_reservation.club_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not an active member of this club' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'reservation', jsonb_build_object(
      'id', v_reservation.id,
      'status', v_reservation.status,
      'is_open', v_reservation.is_open,
      'date', v_reservation.date,
      'start_time', v_reservation.start_time,
      'duration_minutes', v_reservation.duration_minutes,
      'type', v_reservation.type,
      'court_name', crt.name,
      'created_by', v_reservation.created_by,
      'creator_name', creator.full_name,
      'is_creator', v_reservation.created_by = auth.uid(),
      'price_amount', v_reservation.price_amount,
      'price_currency', v_reservation.price_currency
    ),
    'club', jsonb_build_object(
      'id', cl.id,
      'name', cl.name,
      'slug', cl.slug
    ),
    'can_manage', COALESCE(v_role, '') IN ('OWNER', 'ADMIN') OR v_reservation.created_by = auth.uid(),
    'player_count', public._reservation_effective_player_count(p_reservation_id),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'profile_id', pl.profile_id,
        'full_name', pl.full_name,
        'avatar_url', pl.avatar_url,
        'category', pl.category
      ) ORDER BY pl.full_name)
      FROM (
        -- UNION (not UNION ALL) already guarantees distinct profile_ids —
        -- the creator branch is only included via the NOT EXISTS guard
        -- when it isn't already a reservation_players row, so the two
        -- branches can never overlap by construction either.
        SELECT
          member.profile_id, prof.full_name, prof.avatar_url,
          cyc.category
        FROM (
          SELECT profile_id FROM public.reservation_players WHERE reservation_id = p_reservation_id
          UNION
          SELECT v_reservation.created_by
          WHERE EXISTS (
            SELECT 1 FROM public.club_members ccm
            WHERE ccm.club_id = v_reservation.club_id AND ccm.profile_id = v_reservation.created_by
              AND ccm.role = 'PLAYER'
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.reservation_players rp2
            WHERE rp2.reservation_id = p_reservation_id AND rp2.profile_id = v_reservation.created_by
          )
        ) member
        JOIN public.profiles prof ON prof.id = member.profile_id
        LEFT JOIN public.club_members pcm ON pcm.club_id = v_reservation.club_id AND pcm.profile_id = member.profile_id
        LEFT JOIN public.club_member_sport_state sps ON sps.club_member_id = pcm.id
        LEFT JOIN public.club_ranking_cycles cyc ON cyc.id = sps.cycle_id
      ) pl
    ), '[]'::jsonb),
    'my_request', (
      SELECT jsonb_build_object('id', jr.id, 'status', jr.status)
      FROM public.reservation_join_requests jr
      WHERE jr.reservation_id = p_reservation_id AND jr.profile_id = auth.uid()
      ORDER BY jr.created_at DESC
      LIMIT 1
    ),
    'am_participant', EXISTS (
      SELECT 1 FROM public.reservation_players WHERE reservation_id = p_reservation_id AND profile_id = auth.uid()
    ),
    'has_schedule_conflict', EXISTS (
      SELECT 1 FROM public.reservations other
      WHERE other.id <> p_reservation_id
        AND other.status IN ('pending', 'confirmed')
        AND (
          other.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.reservation_players orp
            WHERE orp.reservation_id = other.id AND orp.profile_id = auth.uid()
          )
        )
        AND other.date = v_reservation.date
        AND other.start_time < (v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval)
        AND (other.start_time + (other.duration_minutes || ' minutes')::interval) > v_reservation.start_time
    )
  )
  INTO v_result
  FROM public.clubs cl
  LEFT JOIN public.courts crt ON crt.id = v_reservation.court_id
  LEFT JOIN public.profiles creator ON creator.id = v_reservation.created_by
  WHERE cl.id = v_reservation.club_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reservation_share_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reservation_share_detail(uuid) TO authenticated;
