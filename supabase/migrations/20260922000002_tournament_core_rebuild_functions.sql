-- ============================================================
-- Reconstrucción del núcleo de Torneos — funciones
-- (Bloque 1, nueva especificación funcional)
-- Mi Pádel Club
-- ============================================================
-- Núcleo funcional completo del nuevo modelo: creación, ciclo de vida del
-- torneo (draft → registration_open → registration_closed → in_progress →
-- completed, con cancelled como terminal alterno), inscripciones (con
-- rechazo, cierre automático por cupo y reapertura), duplas (registro,
-- reemplazo/corrección de integrante) y clasificación por puntos con
-- finalización idempotente que aplica esos puntos al ranking existente.
--
-- Ninguna función de esta migración crea ni consulta partidos, rondas,
-- llaves o canchas — esas entidades ya no existen en el esquema.
--
-- Autorización: mismo patrón vigente en todo el módulo (auditado en
-- 20260825000001_fix_sport_state_authorization_bypass y reutilizado sin
-- cambios en cada función previa de Torneos) — membresía ACTIVA
-- consultada directamente en club_members, `IF NOT FOUND` explícito,
-- comparación POSITIVA (`role IN (...)`), nunca `NOT IN` sobre un valor
-- que pueda ser NULL.
--
-- _require_club_not_archived: se exige en toda operación que crea o
-- amplía un compromiso nuevo contra el club (crear/editar/abrir/reabrir
-- torneo, inscribir, confirmar, reemplazar integrante, editar puntos,
-- iniciar) — nunca en una operación que solo resuelve algo ya existente
-- (cerrar, rechazar, retirar, cancelar, finalizar) — mismo criterio ya
-- documentado y aplicado a reservations (CLAUDE.md, Principios de
-- Archivo de Club).
--
-- Todas las funciones RETURNS TABLE declaran exactamente las columnas
-- reales de tournaments (24) o tournament_entries (17) en su orden real
-- — regla dura ya incumplida dos veces en este mismo módulo
-- (20260918000001, 20260921000001) y verificada a mano aquí.
-- ============================================================


-- ─── _close_tournament_registration_for_capacity (helper interno) ───────
-- Invocado únicamente desde register_tournament_entry (rama OWNER/ADMIN)
-- y confirm_tournament_entry, solo cuando el torneo todavía está
-- registration_open. Cierra el torneo y rechaza en bloque toda solicitud
-- pendiente restante con motivo fijo 'capacity_reached', en la misma
-- transacción que la confirmación que completó el cupo.
CREATE OR REPLACE FUNCTION public._close_tournament_registration_for_capacity(
  p_tournament_id uuid,
  p_max_pairs     integer,
  p_actor         uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_confirmed_count int;
BEGIN
  SELECT count(*) INTO v_confirmed_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_count < p_max_pairs THEN
    RETURN;
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_closed'
  WHERE t.id = p_tournament_id AND t.status = 'registration_open';

  UPDATE public.tournament_entries AS te
  SET status = 'rejected', rejected_at = now(), rejected_by = p_actor,
      rejection_reason = 'capacity_reached'
  WHERE te.tournament_id = p_tournament_id AND te.status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public._close_tournament_registration_for_capacity(uuid, integer, uuid) FROM PUBLIC;


-- ─── create_tournament ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tournament(
  p_club_id                 uuid,
  p_name                    text,
  p_category                text,
  p_max_pairs               integer,
  p_description             text DEFAULT NULL,
  p_visibility              text DEFAULT 'private',
  p_registration_opens_at   timestamptz DEFAULT NULL,
  p_registration_closes_at  timestamptz DEFAULT NULL,
  p_starts_at               timestamptz DEFAULT NULL,
  p_ends_at                 timestamptz DEFAULT NULL,
  p_secondary_category      text DEFAULT NULL,
  p_prize_description       text DEFAULT NULL,
  p_cover_image_url         text DEFAULT NULL
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  secondary_category      text,
  max_pairs               integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  started_at              timestamptz,
  started_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  prize_description       text,
  cover_image_url         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;

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

  IF p_max_pairs IS NULL OR p_max_pairs < 1 THEN
    RAISE EXCEPTION 'Invalid max pairs' USING ERRCODE = '22023';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_starts_at > p_ends_at THEN
    RAISE EXCEPTION 'starts_at must not be after ends_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tournaments (
    club_id, name, description, category, secondary_category, max_pairs, visibility,
    registration_opens_at, registration_closes_at, starts_at, ends_at,
    prize_description, cover_image_url, created_by
  ) VALUES (
    p_club_id, v_name, v_description, p_category, p_secondary_category, p_max_pairs, p_visibility,
    p_registration_opens_at, p_registration_closes_at, p_starts_at, p_ends_at,
    v_prize, NULLIF(btrim(COALESCE(p_cover_image_url, '')), ''), auth.uid()
  )
  RETURNING * INTO v_tournament;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament(
  uuid, text, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tournament(
  uuid, text, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text
) TO authenticated;


-- ─── update_tournament ────────────────────────────────────────────────
-- draft: todos los campos editables. registration_open: category/
-- secondary_category/max_pairs/registration_opens_at deben llegar
-- idénticos al valor guardado — mismo congelamiento ya vigente.
CREATE OR REPLACE FUNCTION public.update_tournament(
  p_tournament_id           uuid,
  p_name                    text,
  p_description             text,
  p_category                text,
  p_max_pairs               integer,
  p_visibility              text,
  p_registration_opens_at   timestamptz,
  p_registration_closes_at  timestamptz,
  p_starts_at               timestamptz,
  p_ends_at                 timestamptz,
  p_secondary_category      text,
  p_prize_description       text,
  p_cover_image_url         text
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  secondary_category      text,
  max_pairs               integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  started_at              timestamptz,
  started_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  prize_description       text,
  cover_image_url         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_tournament     public.tournaments%ROWTYPE;
  v_name           text;
  v_description    text;
  v_prize          text;
  v_updated_count  int;
  v_primary_sort   smallint;
  v_secondary_sort smallint;
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

  IF v_tournament.status NOT IN ('draft', 'registration_open') THEN
    RAISE EXCEPTION 'Tournament is not in an editable state' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status = 'registration_open' THEN
    IF p_category IS DISTINCT FROM v_tournament.category THEN
      RAISE EXCEPTION 'category cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
    IF p_secondary_category IS DISTINCT FROM v_tournament.secondary_category THEN
      RAISE EXCEPTION 'secondary_category cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
    IF p_max_pairs IS DISTINCT FROM v_tournament.max_pairs THEN
      RAISE EXCEPTION 'max_pairs cannot change once registration is open' USING ERRCODE = '22023';
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

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_starts_at > p_ends_at THEN
    RAISE EXCEPTION 'starts_at must not be after ends_at' USING ERRCODE = '22023';
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
      ends_at = p_ends_at,
      prize_description = v_prize,
      cover_image_url = NULLIF(btrim(COALESCE(p_cover_image_url, '')), '')
  WHERE t.id = p_tournament_id AND t.status = v_tournament.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text
) TO authenticated;


-- ─── open_tournament_registration ───────────────────────────────────────
-- draft → registration_open. Solo exige que el calendario esté
-- completamente configurado — nunca una comparación contra now(): abrir/
-- cerrar/reabrir son siempre decisiones explícitas del organizador, las
-- fechas configuradas quedan como información, no como automatismo.
CREATE OR REPLACE FUNCTION public.open_tournament_registration(p_tournament_id uuid)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  secondary_category      text,
  max_pairs               integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  started_at              timestamptz,
  started_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  prize_description       text,
  cover_image_url         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
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
    RAISE EXCEPTION 'Not authorized to open registration for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to open registration for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft tournament can open registration' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.registration_opens_at IS NULL OR v_tournament.registration_closes_at IS NULL
     OR v_tournament.starts_at IS NULL OR v_tournament.ends_at IS NULL THEN
    RAISE EXCEPTION 'Tournament schedule is not fully configured' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_open'
  WHERE t.id = p_tournament_id AND t.status = 'draft';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament is no longer in draft' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.open_tournament_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_tournament_registration(uuid) TO authenticated;


-- ─── close_tournament_registration ──────────────────────────────────────
-- registration_open → registration_closed. Cierre manual — nunca rechaza
-- solicitudes pendientes por sí solo (a diferencia del cierre automático
-- por cupo): el organizador sigue pudiendo aprobar/rechazar lo pendiente
-- después de cerrar. Resuelve, no crea un compromiso nuevo — sin
-- _require_club_not_archived, mismo criterio que cancel_reservation.
CREATE OR REPLACE FUNCTION public.close_tournament_registration(p_tournament_id uuid)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  secondary_category      text,
  max_pairs               integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  started_at              timestamptz,
  started_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  prize_description       text,
  cover_image_url         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
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
    RAISE EXCEPTION 'Not authorized to close registration for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to close registration for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Only a tournament with open registration can be closed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_closed'
  WHERE t.id = p_tournament_id AND t.status = 'registration_open';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament registration is no longer open' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.close_tournament_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_tournament_registration(uuid) TO authenticated;


-- ─── reopen_tournament_registration ──────────────────────────────────────
-- registration_closed → registration_open. Nueva. Nunca reactiva
-- solicitudes ya rechazadas (quedan tal cual, status='rejected'); un
-- jugador rechazado que quiera participar debe volver a inscribirse.
-- Renotificar a los elegibles pertenece a un bloque posterior
-- (restricción explícita: sin notificaciones nuevas en este bloque).
CREATE OR REPLACE FUNCTION public.reopen_tournament_registration(p_tournament_id uuid)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  secondary_category      text,
  max_pairs               integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  started_at              timestamptz,
  started_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  prize_description       text,
  cover_image_url         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
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
    RAISE EXCEPTION 'Not authorized to reopen registration for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to reopen registration for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'registration_closed' THEN
    RAISE EXCEPTION 'Only a tournament with closed registration can reopen' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_open'
  WHERE t.id = p_tournament_id AND t.status = 'registration_closed';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament registration is no longer closed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_tournament_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_tournament_registration(uuid) TO authenticated;


-- ─── cancel_tournament ───────────────────────────────────────────────────
-- Cancelable desde cualquier estado no terminal, incluyendo in_progress:
-- sin bracket ni asignaciones de cancha que liberar, la cancelación ya
-- no tiene ningún efecto colateral que atender — se retira la postura
-- conservadora que excluía bracket_generated/in_progress en el diseño
-- anterior, que existía únicamente por ese acoplamiento ya eliminado.
CREATE OR REPLACE FUNCTION public.cancel_tournament(p_tournament_id uuid)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  secondary_category      text,
  max_pairs               integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  started_at              timestamptz,
  started_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  prize_description       text,
  cover_image_url         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
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
    RAISE EXCEPTION 'Not authorized to cancel this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to cancel this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status NOT IN ('draft', 'registration_open', 'registration_closed', 'in_progress') THEN
    RAISE EXCEPTION 'Tournament cannot be cancelled in its current state' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.status = v_tournament.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_tournament(uuid) TO authenticated;


-- ─── start_tournament ────────────────────────────────────────────────────
-- registration_closed → in_progress. Nueva — el botón explícito "Iniciar
-- torneo" de la especificación funcional. Exige al menos una dupla
-- confirmada.
CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id uuid)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  secondary_category      text,
  max_pairs               integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  started_at              timestamptz,
  started_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  prize_description       text,
  cover_image_url         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member   public.club_members%ROWTYPE;
  v_tournament      public.tournaments%ROWTYPE;
  v_confirmed_count int;
  v_updated_count   int;
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
    RAISE EXCEPTION 'Not authorized to start this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to start this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'registration_closed' THEN
    RAISE EXCEPTION 'Only a tournament with closed registration can start' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_confirmed_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_count < 1 THEN
    RAISE EXCEPTION 'Tournament needs at least one confirmed pair to start' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'in_progress', started_at = now(), started_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.status = 'registration_closed';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.start_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_tournament(uuid) TO authenticated;


-- ─── register_tournament_entry ──────────────────────────────────────────
-- Un PLAYER solo puede inscribir su propia dupla, únicamente mientras
-- registration_open, sujeto al cupo (pending+confirmed < max_pairs) →
-- crea 'pending'. OWNER/ADMIN puede registrar cualquier dupla válida en
-- registration_open, registration_closed o in_progress (agregar nuevas
-- duplas "durante el torneo", sin restricción de cupo una vez fuera de
-- registration_open — ítem 13 de la especificación) → crea 'confirmed'
-- directamente y, si corresponde, dispara el cierre automático por cupo.
CREATE OR REPLACE FUNCTION public.register_tournament_entry(
  p_tournament_id       uuid,
  p_club_member_one_id  uuid,
  p_club_member_two_id  uuid
)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_one     public.club_members%ROWTYPE;
  v_member_two     public.club_members%ROWTYPE;
  v_category_one   text;
  v_category_two   text;
  v_high_count     int;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_conflict_count int;
  v_entry_count    int;
  v_entry          public.tournament_entries%ROWTYPE;
  v_is_admin       boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_club_member_one_id IS NULL OR p_club_member_two_id IS NULL THEN
    RAISE EXCEPTION 'Both players are required' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id = p_club_member_two_id THEN
    RAISE EXCEPTION 'The two players must be different' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  v_is_admin := v_caller_member.role IN ('OWNER', 'ADMIN');

  IF v_is_admin THEN
    IF v_tournament.status NOT IN ('registration_open', 'registration_closed', 'in_progress') THEN
      RAISE EXCEPTION 'Tournament is not accepting new pairs' USING ERRCODE = '22023';
    END IF;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> p_club_member_one_id AND v_caller_member.id <> p_club_member_two_id THEN
      RAISE EXCEPTION 'A player can only register a pair they are part of' USING ERRCODE = '42501';
    END IF;
    IF v_tournament.status <> 'registration_open' THEN
      RAISE EXCEPTION 'Tournament registration is not open' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  SELECT * INTO v_member_one
  FROM public.club_members AS cm WHERE cm.id = p_club_member_one_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_member_one.is_active IS NOT TRUE OR v_member_one.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player one is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member_two
  FROM public.club_members AS cm WHERE cm.id = p_club_member_two_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_member_two.is_active IS NOT TRUE OR v_member_two.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player two is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  -- Composición de categorías — mismo join que get_club_category_ranking:
  -- club_member_sport_state (una fila por jugador) unida a su ciclo
  -- vigente (ended_at IS NULL).
  SELECT c.category INTO v_category_one
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_one_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.category INTO v_category_two
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_two_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.secondary_category IS NULL THEN
    IF v_category_one <> v_tournament.category OR v_category_two <> v_tournament.category THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_category_one NOT IN (v_tournament.category, v_tournament.secondary_category)
       OR v_category_two NOT IN (v_tournament.category, v_tournament.secondary_category) THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;

    v_high_count := 0;
    IF v_category_one = v_tournament.category THEN v_high_count := v_high_count + 1; END IF;
    IF v_category_two = v_tournament.category THEN v_high_count := v_high_count + 1; END IF;
    IF v_high_count > 1 THEN
      RAISE EXCEPTION 'Invalid combined category pair for this tournament' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_club_member_one_id < p_club_member_two_id THEN
    v_lock_first := p_club_member_one_id; v_lock_second := p_club_member_two_id;
  ELSE
    v_lock_first := p_club_member_two_id; v_lock_second := p_club_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = p_tournament_id
    AND tem.club_member_id IN (p_club_member_one_id, p_club_member_two_id)
    AND tem.is_active = true
    AND te.status IN ('pending', 'confirmed');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_admin OR v_tournament.status = 'registration_open' THEN
    SELECT count(*) INTO v_entry_count
    FROM public.tournament_entries AS te
    WHERE te.tournament_id = p_tournament_id AND te.status IN ('pending', 'confirmed');

    IF v_entry_count >= v_tournament.max_pairs THEN
      RAISE EXCEPTION 'Tournament has reached its maximum number of pairs' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_is_admin THEN
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, secondary_category, status, confirmed_at, confirmed_by, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, v_tournament.secondary_category,
      'confirmed', now(), auth.uid(), auth.uid()
    )
    RETURNING * INTO v_entry;
  ELSE
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, secondary_category, status, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, v_tournament.secondary_category,
      'pending', auth.uid()
    )
    RETURNING * INTO v_entry;
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_one_id),
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_two_id);

  IF v_is_admin AND v_tournament.status = 'registration_open' THEN
    PERFORM public._close_tournament_registration_for_capacity(p_tournament_id, v_tournament.max_pairs, auth.uid());
  END IF;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) TO authenticated;


-- ─── confirm_tournament_entry ────────────────────────────────────────────
-- Solo OWNER/ADMIN, solo desde 'pending', mientras registration_open o
-- registration_closed (el organizador sigue resolviendo lo pendiente
-- después de un cierre manual). Dispara el cierre automático por cupo
-- cuando corresponde.
CREATE OR REPLACE FUNCTION public.confirm_tournament_entry(p_tournament_entry_id uuid)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_entry          public.tournament_entries%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_ids     uuid[];
  v_member_one_id  uuid;
  v_member_two_id  uuid;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_conflict_count int;
  v_entry_count    int;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT te.tournament_id INTO v_tournament_id FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = v_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to confirm this tournament entry' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to confirm this tournament entry' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending entry can be confirmed' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not accepting confirmations' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(tem.club_member_id) INTO v_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id AND tem.is_active = true;

  IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two active members' USING ERRCODE = '22023';
  END IF;

  v_member_one_id := v_member_ids[1];
  v_member_two_id := v_member_ids[2];

  IF v_member_one_id < v_member_two_id THEN
    v_lock_first := v_member_one_id; v_lock_second := v_member_two_id;
  ELSE
    v_lock_first := v_member_two_id; v_lock_second := v_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = v_tournament_id
    AND tem.club_member_id IN (v_member_one_id, v_member_two_id)
    AND tem.is_active = true
    AND te.status IN ('pending', 'confirmed')
    AND te.id <> p_tournament_entry_id;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has another active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_entry_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = v_tournament_id AND te.status = 'confirmed';

  IF v_entry_count >= v_tournament.max_pairs THEN
    RAISE EXCEPTION 'Tournament has reached its maximum number of pairs' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
  WHERE te.id = p_tournament_entry_id AND te.status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament entry was modified concurrently' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status = 'registration_open' THEN
    PERFORM public._close_tournament_registration_for_capacity(v_tournament_id, v_tournament.max_pairs, auth.uid());
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_tournament_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_entry(uuid) TO authenticated;


-- ─── reject_tournament_entry ─────────────────────────────────────────────
-- Nueva. Solo OWNER/ADMIN, solo desde 'pending', con comentario
-- obligatorio. Mismos estados de torneo permitidos que confirm. Resuelve
-- una solicitud, no crea un compromiso — sin _require_club_not_archived.
CREATE OR REPLACE FUNCTION public.reject_tournament_entry(
  p_tournament_entry_id uuid,
  p_reason              text
)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_entry          public.tournament_entries%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_reason         text;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT te.tournament_id INTO v_tournament_id FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = v_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to reject this tournament entry' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to reject this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending entry can be rejected' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows rejection' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), rejection_reason = v_reason
  WHERE te.id = p_tournament_entry_id AND te.status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament entry was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_tournament_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_tournament_entry(uuid, text) TO authenticated;


-- ─── withdraw_tournament_entry ───────────────────────────────────────────
-- Sin cambios de comportamiento frente al diseño anterior: desde
-- 'pending' o 'confirmed', mientras registration_open o
-- registration_closed — "las duplas pueden eliminarse antes del inicio".
CREATE OR REPLACE FUNCTION public.withdraw_tournament_entry(p_tournament_entry_id uuid)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_entry          public.tournament_entries%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_ids     uuid[];
  v_member_one_id  uuid;
  v_member_two_id  uuid;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT te.tournament_id INTO v_tournament_id FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = v_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(tem.club_member_id) INTO v_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id AND tem.is_active = true;

  IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two active members' USING ERRCODE = '22023';
  END IF;

  v_member_one_id := v_member_ids[1];
  v_member_two_id := v_member_ids[2];

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to withdraw this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> v_member_one_id AND v_caller_member.id <> v_member_two_id THEN
      RAISE EXCEPTION 'A player can only withdraw an entry they are part of' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to withdraw this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Only a pending or confirmed entry can be withdrawn' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows withdrawal' USING ERRCODE = '22023';
  END IF;

  IF v_member_one_id < v_member_two_id THEN
    v_lock_first := v_member_one_id; v_lock_second := v_member_two_id;
  ELSE
    v_lock_first := v_member_two_id; v_lock_second := v_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_second::text));

  UPDATE public.tournament_entries AS te
  SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid()
  WHERE te.id = p_tournament_entry_id AND te.status = v_entry.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament entry was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_tournament_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_tournament_entry(uuid) TO authenticated;


-- ─── replace_tournament_entry_member ─────────────────────────────────────
-- Nueva. Cubre tanto "reemplazar" como "corregir" un integrante — misma
-- operación mecánica. Solo OWNER/ADMIN, solo sobre una entry 'confirmed',
-- solo mientras el torneo está in_progress ("durante el torneo"). El
-- integrante saliente se marca inactivo (nunca se borra) y se inserta una
-- fila activa nueva para el entrante — la dupla conserva sus puntos sin
-- ningún cambio, porque los puntos viven en tournament_entries, no en
-- tournament_entry_members.
CREATE OR REPLACE FUNCTION public.replace_tournament_entry_member(
  p_tournament_entry_id  uuid,
  p_old_club_member_id   uuid,
  p_new_club_member_id   uuid
)
RETURNS TABLE (
  id                   uuid,
  tournament_entry_id  uuid,
  tournament_id        uuid,
  club_id              uuid,
  club_member_id       uuid,
  is_active            boolean,
  replaced_at          timestamptz,
  replaced_by          uuid,
  created_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_entry            public.tournament_entries%ROWTYPE;
  v_tournament        public.tournaments%ROWTYPE;
  v_caller_member     public.club_members%ROWTYPE;
  v_new_member         public.club_members%ROWTYPE;
  v_partner_member_id  uuid;
  v_new_category        text;
  v_partner_category     text;
  v_old_row_exists       boolean;
  v_lock_first           uuid;
  v_lock_second           uuid;
  v_conflict_count        int;
  v_updated_count         int;
  v_new_row               public.tournament_entry_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_old_club_member_id IS NULL OR p_new_club_member_id IS NULL THEN
    RAISE EXCEPTION 'Both the outgoing and incoming players are required' USING ERRCODE = '22023';
  END IF;
  IF p_old_club_member_id = p_new_club_member_id THEN
    RAISE EXCEPTION 'The incoming player must be different from the outgoing player' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = v_entry.tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to replace a member of this entry' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to replace a member of this entry' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_entry.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed entry can have its members replaced' USING ERRCODE = '22023';
  END IF;
  IF v_tournament.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Members can only be replaced while the tournament is in progress' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_entry_members AS tem
    WHERE tem.tournament_entry_id = p_tournament_entry_id
      AND tem.club_member_id = p_old_club_member_id AND tem.is_active = true
  ) INTO v_old_row_exists;
  IF NOT v_old_row_exists THEN
    RAISE EXCEPTION 'The outgoing player is not an active member of this entry' USING ERRCODE = '22023';
  END IF;

  SELECT tem.club_member_id INTO v_partner_member_id
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id
    AND tem.is_active = true AND tem.club_member_id <> p_old_club_member_id;
  IF v_partner_member_id IS NULL THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two active members' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_new_member
  FROM public.club_members AS cm WHERE cm.id = p_new_club_member_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_new_member.is_active IS NOT TRUE OR v_new_member.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Incoming player is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  IF p_old_club_member_id < p_new_club_member_id THEN
    v_lock_first := p_old_club_member_id; v_lock_second := p_new_club_member_id;
  ELSE
    v_lock_first := p_new_club_member_id; v_lock_second := p_old_club_member_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_entry.tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_entry.tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = v_entry.tournament_id
    AND tem.club_member_id = p_new_club_member_id
    AND tem.is_active = true
    AND te.status IN ('pending', 'confirmed');
  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'The incoming player already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT c.category INTO v_new_category
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_new_club_member_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.category INTO v_partner_category
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = v_partner_member_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.secondary_category IS NULL THEN
    IF v_new_category <> v_tournament.category THEN
      RAISE EXCEPTION 'Incoming player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_new_category NOT IN (v_tournament.category, v_tournament.secondary_category) THEN
      RAISE EXCEPTION 'Incoming player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
    IF v_new_category = v_tournament.category AND v_partner_category = v_tournament.category THEN
      RAISE EXCEPTION 'Invalid combined category pair for this tournament' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.tournament_entry_members AS tem
  SET is_active = false, replaced_at = now(), replaced_by = auth.uid()
  WHERE tem.tournament_entry_id = p_tournament_entry_id
    AND tem.club_member_id = p_old_club_member_id AND tem.is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Outgoing player was modified concurrently' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES (p_tournament_entry_id, v_entry.tournament_id, v_tournament.club_id, p_new_club_member_id)
  RETURNING * INTO v_new_row;

  RETURN QUERY SELECT
    v_new_row.id, v_new_row.tournament_entry_id, v_new_row.tournament_id, v_new_row.club_id,
    v_new_row.club_member_id, v_new_row.is_active, v_new_row.replaced_at, v_new_row.replaced_by,
    v_new_row.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_tournament_entry_member(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_tournament_entry_member(uuid, uuid, uuid) TO authenticated;


-- ─── set_tournament_entry_points ─────────────────────────────────────────
-- Nueva. Edición libre, en bloque, de los puntos de cualquier número de
-- duplas confirmadas de un mismo torneo, en una sola transacción — el
-- primitivo backend detrás del futuro botón único "Guardar puntos"
-- (pantalla que pertenece a un bloque posterior). Solo mientras
-- in_progress. Enteros no negativos, nunca decimales ni negativos.
CREATE OR REPLACE FUNCTION public.set_tournament_entry_points(
  p_tournament_id uuid,
  p_entry_ids     uuid[],
  p_points        integer[]
)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_count          int;
  v_bad_count      int;
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
    RAISE EXCEPTION 'Not authorized to edit points for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to edit points for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Tournament is not in progress' USING ERRCODE = '22023';
  END IF;

  IF p_entry_ids IS NULL OR p_points IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No entries provided' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_entry_ids, 1) <> array_length(p_points, 1) THEN
    RAISE EXCEPTION 'Entry ids and points must have the same length' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count FROM unnest(p_points) AS pt WHERE pt IS NULL OR pt < 0;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Points must be non-negative integers' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count FROM (SELECT DISTINCT x FROM unnest(p_entry_ids) AS x) AS d;
  IF v_bad_count <> array_length(p_entry_ids, 1) THEN
    RAISE EXCEPTION 'Duplicate entry ids provided' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.tournament_entries AS te
  WHERE te.id = ANY(p_entry_ids) AND te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_count <> array_length(p_entry_ids, 1) THEN
    RAISE EXCEPTION 'All entries must be confirmed entries of this tournament' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET points = u.points
  FROM (SELECT unnest(p_entry_ids) AS entry_id, unnest(p_points) AS points) AS u
  WHERE te.id = u.entry_id;

  RETURN QUERY
  SELECT te.id, te.tournament_id, te.club_id, te.category, te.secondary_category, te.status, te.points,
         te.confirmed_at, te.confirmed_by, te.withdrawn_at, te.withdrawn_by,
         te.rejected_at, te.rejected_by, te.rejection_reason,
         te.created_by, te.created_at, te.updated_at
  FROM public.tournament_entries AS te
  WHERE te.id = ANY(p_entry_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.set_tournament_entry_points(uuid, uuid[], integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tournament_entry_points(uuid, uuid[], integer[]) TO authenticated;


-- ─── finalize_tournament ──────────────────────────────────────────────────
-- in_progress → completed. Congela la clasificación (los puntos ya
-- dejaron de ser editables una vez completed) y aplica, en partes
-- iguales, los puntos actuales de cada dupla confirmada a sus dos
-- integrantes finales (is_active = true) del ranking existente. Nunca
-- recalcula ni deriva posiciones — usa exactamente el valor ya guardado
-- en tournament_entries.points, la misma fuente que ya ordena la
-- clasificación en vivo, nunca una tabla paralela.
--
-- Idempotencia doble: verificación previa por conteo de movimientos
-- (nunca solo el total) + el índice único
-- club_player_point_movements_one_per_tournament_member como garantía de
-- base de datos. Si el torneo ya está completed y el conteo de
-- movimientos coincide con lo esperado, se responde already_finalized
-- sin volver a escribir nada.
CREATE OR REPLACE FUNCTION public.finalize_tournament(p_tournament_id uuid)
RETURNS TABLE (
  tournament_id      uuid,
  entries_awarded    integer,
  movements_created  integer,
  already_finalized  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament          public.tournaments%ROWTYPE;
  v_caller_member       public.club_members%ROWTYPE;
  v_confirmed_ids       uuid[];
  v_expected_movements  int;
  v_existing_movements  int;
  v_entry_id            uuid;
  v_entry               public.tournament_entries%ROWTYPE;
  v_member_ids          uuid[];
  v_member_id           uuid;
  v_state               public.club_member_sport_state%ROWTYPE;
  v_category            text;
  v_new_total           integer;
  v_movement_count      integer := 0;
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
    RAISE EXCEPTION 'Not authorized to finalize this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to finalize this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status NOT IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION 'Tournament is not in progress' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(te.id) INTO v_confirmed_ids
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_ids IS NULL OR array_length(v_confirmed_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Tournament has no confirmed entries' USING ERRCODE = '22023';
  END IF;

  v_expected_movements := array_length(v_confirmed_ids, 1) * 2;

  SELECT count(*) INTO v_existing_movements
  FROM public.club_player_point_movements AS m
  WHERE m.tournament_id = p_tournament_id AND m.system_event_code = 'tournament_points';

  IF v_tournament.status = 'completed' THEN
    IF v_existing_movements <> v_expected_movements THEN
      RAISE EXCEPTION 'Tournament points are in an inconsistent state' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT p_tournament_id, array_length(v_confirmed_ids, 1), v_existing_movements, true;
    RETURN;
  END IF;

  IF v_existing_movements > 0 THEN
    RAISE EXCEPTION 'Tournament points are in an inconsistent state' USING ERRCODE = '22023';
  END IF;

  FOR v_entry_id IN SELECT unnest(v_confirmed_ids) AS x ORDER BY x LOOP
    SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = v_entry_id;

    SELECT array_agg(tem.club_member_id ORDER BY tem.club_member_id) INTO v_member_ids
    FROM public.tournament_entry_members AS tem
    WHERE tem.tournament_entry_id = v_entry_id AND tem.is_active = true;

    IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
      RAISE EXCEPTION 'A confirmed entry does not have exactly two active members' USING ERRCODE = '22023';
    END IF;

    FOREACH v_member_id IN ARRAY v_member_ids LOOP
      SELECT * INTO v_state FROM public.club_member_sport_state AS s WHERE s.club_member_id = v_member_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Player has no sport state yet' USING ERRCODE = 'P0002';
      END IF;
      IF v_state.club_id <> v_tournament.club_id THEN
        RAISE EXCEPTION 'Sport state does not belong to this club' USING ERRCODE = '22023';
      END IF;

      SELECT c.category INTO v_category FROM public.club_ranking_cycles AS c WHERE c.id = v_state.cycle_id;

      v_new_total := v_state.current_points + v_entry.points;

      UPDATE public.club_member_sport_state AS s
      SET current_points = v_new_total, points_reached_at = now()
      WHERE s.club_member_id = v_member_id;

      INSERT INTO public.club_player_point_movements (
        club_id, club_member_id, cycle_id, category,
        previous_total, new_total, delta,
        adjustment_mode, origin, system_event_code, tournament_id, comment, created_by
      ) VALUES (
        v_tournament.club_id, v_member_id, v_state.cycle_id, v_category,
        v_state.current_points, v_new_total, v_entry.points,
        'delta', 'system', 'tournament_points', p_tournament_id, 'Puntos de torneo', auth.uid()
      );

      v_movement_count := v_movement_count + 1;
    END LOOP;
  END LOOP;

  UPDATE public.tournaments AS t
  SET status = 'completed', completed_at = now(), completed_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT p_tournament_id, array_length(v_confirmed_ids, 1), v_movement_count, false;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_tournament(uuid) TO authenticated;
