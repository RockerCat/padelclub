-- ============================================================
-- Reingreso a un club tras deshabilitación — fix puntual
-- Mi Pádel Club
-- ============================================================
-- Bug real: club_members.is_active = false (deactivate_player) deja
-- deshabilitado al jugador correctamente, pero club_join_requests
-- conserva su fila histórica con status = 'approved' (UNIQUE
-- (club_id, profile_id) — nunca hay una segunda fila). create_join_request
-- usaba ese 'approved' histórico como proxy de "ya es miembro" y rechazaba
-- (23505 "Already a member") aunque ya no existiera membresía activa,
-- bloqueando por completo el reingreso. Si de todos modos se lograra
-- aprobar una nueva solicitud, approve_join_request/join_public_club
-- usaban ON CONFLICT (club_id, profile_id) DO NOTHING sobre club_members —
-- un no-op silencioso que jamás reactivaba la fila inactiva existente.
--
-- Se redefinen aquí las 3 funciones reproduciendo exactamente su última
-- versión real (create_join_request/join_public_club:
-- 20260830000001_require_player_phone.sql; approve_join_request:
-- 20261008000001_superadmin_club_access.sql), con solo los cambios
-- descritos abajo — ninguna otra validación (auth.uid(), rol, club,
-- visibility, teléfono/WhatsApp, códigos de error existentes) se toca.
-- Ninguna migración histórica se modifica. Ningún DROP, ningún CASCADE,
-- ningún dato de prueba.
-- ============================================================


-- ─── 1. create_join_request ────────────────────────────────────────────────
-- Único cambio real: cuando ya existe una club_join_requests row para este
-- (club_id, profile_id) con status = 'approved', ya sabemos (por el check
-- de is_active = true inmediatamente anterior, que de haber encontrado una
-- membresía activa ya habría abortado la función con 23505) que esa
-- aprobación quedó sin membresía activa vigente — el jugador fue
-- deshabilitado después. En vez de rechazar, esta fila se reutiliza
-- (nunca se inserta una segunda: UNIQUE club_id/profile_id) exactamente
-- como una solicitud nueva: mismo require_player_phone, mismo pending,
-- mismos timestamps de aprobación/rechazo limpiados, misma notificación a
-- OWNER/ADMIN. 'pending' y 'rejected' siguen exactamente igual que antes.
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

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN; -- no-op: already pending, not a duplicate
    ELSIF v_existing.status = 'rejected' THEN
      RAISE EXCEPTION 'Previously rejected' USING ERRCODE = '22023';
    END IF;
    -- status = 'approved' sin membresía activa (ya descartado arriba) —
    -- se reutiliza esta misma fila más abajo, nunca se inserta una segunda.
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


-- ─── 2. approve_join_request ───────────────────────────────────────────────
-- Único cambio: ON CONFLICT (club_id, profile_id) DO NOTHING → DO UPDATE,
-- para que aprobar una solicitud reactive de verdad una fila club_members
-- ya existente pero inactiva, en vez de dejarla silenciosamente
-- deshabilitada pese a la aprobación. Nunca inserta una segunda fila
-- (mismo UNIQUE de siempre). Resto del cuerpo idéntico a
-- 20261008000001_superadmin_club_access.sql.
CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_request       public.club_join_requests;
  v_club_name     text;
  v_club_slug     text;
  v_account_type  text;
BEGIN
  SELECT * INTO v_request FROM public.club_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.effective_club_role(v_request.club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_request.club_id);

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved' USING ERRCODE = '22023';
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = v_request.profile_id;
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This requester cannot become a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  PERFORM public._require_player_phone(v_request.profile_id);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_request.club_id, v_request.profile_id, 'PLAYER', true)
  ON CONFLICT (club_id, profile_id) DO UPDATE
    SET is_active = true,
        role      = 'PLAYER';

  UPDATE public.profiles SET account_type = 'PLAYER' WHERE id = v_request.profile_id AND account_type IS NULL;

  UPDATE public.club_join_requests
  SET status = 'approved', approved_at = now(), approved_by = auth.uid()
  WHERE id = p_request_id;

  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = v_request.club_id;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    v_request.profile_id,
    v_request.club_id,
    'join_request_approved',
    'Solicitud aprobada',
    'Tu solicitud para unirte a ' || COALESCE(v_club_name, 'el club') || ' fue aprobada.',
    jsonb_build_object(
      'club_id', v_request.club_id,
      'club_slug', v_club_slug,
      'destination', '/' || v_club_slug
    )
  );

  UPDATE public.notifications
  SET resolved_status = 'approved', resolved_at = now()
  WHERE type = 'join_request_created'
    AND (metadata->>'join_request_id')::uuid = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;


-- ─── 3. join_public_club ────────────────────────────────────────────────────
-- Único cambio: el INSERT sin ON CONFLICT (que fallaría por el UNIQUE
-- (club_id, profile_id) si ya existe una fila inactiva de un paso por el
-- club anterior) gana un ON CONFLICT ... DO UPDATE equivalente al de
-- approve_join_request — reactiva la fila existente en vez de fallar. El
-- check v_already_member (is_active = true) sigue exactamente igual arriba
-- y sigue siendo el que decide el no-op cuando ya hay membresía activa;
-- este ON CONFLICT solo puede dispararse cuando esa membresía existe pero
-- está inactiva. Resto del cuerpo idéntico a
-- 20260830000001_require_player_phone.sql.
CREATE OR REPLACE FUNCTION public.join_public_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_visibility      text;
  v_already_member  boolean;
  v_account_type    text;
  v_club_name       text;
  v_club_slug       text;
  v_player_name     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT visibility INTO v_visibility
  FROM public.clubs
  WHERE id = p_club_id AND is_active = true AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  IF v_visibility != 'public' THEN
    RAISE EXCEPTION 'Club is not open for public joining' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND profile_id = auth.uid()
      AND is_active = true
  ) INTO v_already_member;

  IF v_already_member THEN
    RETURN;
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This account cannot join as a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  PERFORM public._require_player_phone(auth.uid());

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (p_club_id, auth.uid(), 'PLAYER', true)
  ON CONFLICT (club_id, profile_id) DO UPDATE
    SET is_active = true,
        role      = 'PLAYER';

  UPDATE public.profiles SET account_type = 'PLAYER' WHERE id = auth.uid() AND account_type IS NULL;

  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;
  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'player_joined_public_club',
    'Nuevo jugador en el club',
    COALESCE(v_player_name, 'Un jugador') || ' se unió a ' || COALESCE(v_club_name, 'tu club') || '.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'player_profile_id', auth.uid(),
      'destination', '/' || v_club_slug || '/admin/players'
    )
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_public_club(uuid) TO authenticated;
