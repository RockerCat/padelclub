-- ============================================================
-- Reingreso a un club tras un rechazo histórico — fix puntual
-- Mi Pádel Club
-- ============================================================
-- Bug real, encontrado con evidencia directa en producción: la migración
-- anterior (20261113000001_rejoin_after_deactivation.sql) solo permitía
-- reutilizar la fila de club_join_requests cuando su status histórico era
-- 'approved' — la rama 'rejected' seguía bloqueando permanentemente
-- (RAISE EXCEPTION ... USING ERRCODE = '22023', "Previously rejected"),
-- incluso sin ninguna membresía activa vigente. Confirmado en DB real: un
-- jugador desactivado, tras reutilizar su solicitud vía el fix anterior
-- (status volvió a 'pending' correctamente) y ser luego RECHAZADO otra vez,
-- quedaba bloqueado de forma permanente al intentar solicitar ingreso una
-- tercera vez — Mobile mostraba el CTA correcto ("Solicitar ingreso", la UI
-- ya revalida is_active/pending correctamente) pero la RPC rechazaba con
-- 22023 y el mensaje "Tu solicitud anterior fue rechazada. Contacta al
-- club directamente." (shared/clubs/clubSwitcher.ts, mismo mapeo en WEB).
--
-- Regla funcional correcta (confirmada): un 'rejected' histórico es el
-- resultado de ESA solicitud puntual, nunca un ban permanente — mismo trato
-- que ya recibía 'approved' sin membresía activa. Solo una solicitud
-- ACTUALMENTE 'pending' debe impedir crear otra en paralelo.
--
-- Se redefine aquí SOLO create_join_request, reproduciendo exactamente su
-- última versión real (20261113000001_rejoin_after_deactivation.sql), con
-- el único cambio descrito abajo — ninguna otra validación (auth.uid(),
-- rol, club, archivado, teléfono/WhatsApp, el check de membresía activa
-- con 23505, ni la notificación a OWNER/ADMIN) se toca. join_public_club y
-- approve_join_request no cambian: ya quedaron correctos en la migración
-- anterior. Ninguna migración histórica se modifica. Ningún DROP, ningún
-- CASCADE, ningún dato de prueba.
CREATE OR REPLACE FUNCTION public.create_join_request(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_existing        public.club_join_requests;
  v_club_name       text;
  v_club_slug       text;
  v_requester_name  text;
  v_request_id      uuid;
  v_account_type    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This account cannot request to join as a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Already a member' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_existing
  FROM public.club_join_requests
  WHERE club_id = p_club_id AND profile_id = auth.uid();

  -- Único cambio real: antes, status = 'rejected' terminaba aquí con
  -- RAISE EXCEPTION ('Previously rejected', 22023) — un bloqueo permanente.
  -- Ahora, el único status que sigue impidiendo una solicitud nueva es
  -- 'pending' (ya hay una en curso, no-op). Cualquier otro histórico
  -- ('approved' sin membresía activa — ya descartado arriba — o
  -- 'rejected') cae al mismo camino de reutilización de la fila que ya
  -- usa una solicitud nueva, más abajo.
  IF v_existing.id IS NOT NULL AND v_existing.status = 'pending' THEN
    RETURN; -- no-op: already pending, not a duplicate
  END IF;

  PERFORM public._require_player_phone(auth.uid());

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.club_join_requests
    SET status      = 'pending',
        created_at  = now(),
        approved_at = NULL,
        approved_by = NULL,
        rejected_at = NULL,
        rejected_by = NULL
    WHERE id = v_existing.id
    RETURNING id INTO v_request_id;
  ELSE
    INSERT INTO public.club_join_requests (club_id, profile_id, status)
    VALUES (p_club_id, auth.uid(), 'pending')
    RETURNING id INTO v_request_id;
  END IF;

  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'join_request_created',
    'Nueva solicitud de ingreso',
    COALESCE(v_requester_name, 'Un usuario') || ' quiere unirse a ' || COALESCE(v_club_name, 'tu club') || '.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'join_request_id', v_request_id,
      'requester_profile_id', auth.uid(),
      'destination', '/' || v_club_slug || '/admin/players'
    )
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_join_request(uuid) TO authenticated;
