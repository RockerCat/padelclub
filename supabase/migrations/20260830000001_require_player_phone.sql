-- ============================================================
-- WhatsApp obligatorio para PLAYER — cierre de huecos de backend
-- Mi Pádel Club
-- ============================================================
-- La validación de UI (SignupForm, ?intent=join-club) no cubre todos los
-- caminos reales hacia PLAYER: un registro genérico (sin ese intent) puede
-- iniciar sesión y luego unirse a un club público, solicitar ingreso a uno
-- privado, ser aprobado por un OWNER/ADMIN, o reactivar una membresía
-- PLAYER legacy — ninguno de esos pasa por SignupForm. Esta migración
-- cierra esos caminos a nivel de base de datos, el único punto que ningún
-- bypass por llamada directa puede evitar.
--
-- Una única función interna, reutilizada por los cuatro puntos (mismo
-- patrón ya establecido en el proyecto para _require_club_not_archived/
-- _require_club_admin: REVOKE ALL FROM PUBLIC, sin GRANT a authenticated,
-- solo invocable desde el cuerpo de otra función SECURITY DEFINER en la
-- misma transacción) — nunca se duplica la regla de validación.
--
-- No se toca ninguna migración ya aplicada: join_public_club,
-- create_join_request y approve_join_request se redefinen aquí vía
-- CREATE OR REPLACE FUNCTION reproduciendo exactamente su última versión
-- (20260815000001_archive_club.sql), con una sola adición cada una — el
-- resto de cada cuerpo (autorización, notificaciones, códigos de error
-- existentes) queda idéntico. Ningún DROP, ningún CASCADE, ningún dato de
-- prueba.
-- ============================================================


-- ─── 1. _require_player_phone — la única regla, un solo lugar ─────────────
-- "Válido" = normalizado (mismas reglas que src/lib/utils/phone.ts:
-- solo dígitos, 8 a 15 de largo) — no se revalida formato con "+"/espacios
-- aquí porque profiles.phone solo se escribe ya normalizado (SignupForm,
-- Mi Perfil, el modal de completar WhatsApp y el backfill local escriben
-- exclusivamente el valor normalizado).
CREATE OR REPLACE FUNCTION public._require_player_phone(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_phone text;
BEGIN
  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_profile_id;

  IF v_phone IS NULL OR btrim(v_phone) = '' OR v_phone !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'A valid WhatsApp phone number is required to join as a player'
      USING ERRCODE = 'P0006';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._require_player_phone(uuid) FROM PUBLIC;


-- ─── 2. join_public_club — une con teléfono o rechaza (P0006) ──────────────
-- Misma función que 20260815000001, con una sola adición: la validación de
-- teléfono corre después del guard de account_type OWNER/ADMIN (para que
-- ese error, más específico, siga ganando) y antes del INSERT en
-- club_members — nunca se llega a crear la membresía sin teléfono válido.
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
  VALUES (p_club_id, auth.uid(), 'PLAYER', true);

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


-- ─── 3. create_join_request — solicitud con teléfono o rechaza (P0006) ────
-- Misma función que 20260815000001, con una sola adición: la validación de
-- teléfono corre justo antes del INSERT en club_join_requests — nunca se
-- crea una solicitud nueva sin teléfono válido. Una solicitud pendiente ya
-- existente (creada antes de esta regla) no se toca aquí — eso lo cubre
-- approve_join_request más abajo, al momento de aprobarla.
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

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      RETURN; -- no-op: already pending, not a duplicate
    ELSIF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Already a member' USING ERRCODE = '23505';
    ELSE
      RAISE EXCEPTION 'Previously rejected' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM public._require_player_phone(auth.uid());

  INSERT INTO public.club_join_requests (club_id, profile_id, status)
  VALUES (p_club_id, auth.uid(), 'pending')
  RETURNING id INTO v_request_id;

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


-- ─── 4. approve_join_request — aprueba con teléfono o rechaza (P0006) ─────
-- Misma función que 20260815000001, con una sola adición: la validación de
-- teléfono corre después del guard de account_type del SOLICITANTE (nunca
-- el de auth.uid(), que aquí es el OWNER/ADMIN aprobando) y antes del
-- INSERT en club_members — cubre exactamente el caso de una solicitud
-- legacy pendiente, creada antes de esta regla, para un profile que
-- todavía no tiene WhatsApp. Si falla, ni la membresía se crea ni el
-- estado de la solicitud cambia (la excepción aborta toda la función) —
-- nunca queda una aprobación parcial.
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

  IF public.club_role(v_request.club_id) NOT IN ('OWNER', 'ADMIN') THEN
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
  ON CONFLICT (club_id, profile_id) DO NOTHING;

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


-- ─── 5. Reactivación (toggleMemberActive) — único camino sin RPC ──────────
-- La activación (is_active: false → true) de un club_members PLAYER es el
-- único de los cuatro caminos que NUNCA pasó por una RPC — es un UPDATE
-- directo de cliente (admin/players/actions.ts, permitido por el GRANT
-- UPDATE (is_active, category) de 20260809000001). No hay cuerpo de
-- función donde insertar un PERFORM — por eso este caso se cierra con un
-- trigger BEFORE UPDATE, el único punto que ningún caller (presente o
-- futuro, RPC o directo) puede evitar. SECURITY DEFINER es obligatorio
-- aquí: el UPDATE real corre como `authenticated`, que no tiene ningún
-- GRANT sobre profiles.phone más allá de su propia fila (mismo problema ya
-- resuelto para set_account_type_from_club_members, 20260826000001).
--
-- Alcance exacto del WHEN: solo la transición real is_active false→true de
-- una fila PLAYER — nunca dispara para altas nuevas (INSERT, ya cubiertas
-- arriba), ni para un simple cambio de category, ni para una reactivación
-- ya en true (no-op), ni para OWNER/ADMIN.
CREATE OR REPLACE FUNCTION public.enforce_player_phone_on_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public._require_player_phone(NEW.profile_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_player_phone_on_reactivation() FROM PUBLIC;

DROP TRIGGER IF EXISTS club_members_require_phone_on_activation ON public.club_members;
CREATE TRIGGER club_members_require_phone_on_activation
  BEFORE UPDATE OF is_active ON public.club_members
  FOR EACH ROW
  WHEN (NEW.role = 'PLAYER' AND NEW.is_active = true AND OLD.is_active = false)
  EXECUTE FUNCTION public.enforce_player_phone_on_reactivation();
