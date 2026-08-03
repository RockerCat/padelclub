-- ============================================================
-- Sistema de notificaciones del ciclo de vida de Torneos
-- Mi Pádel Club
-- ============================================================
-- Implementa los 12 eventos obligatorios auditados previamente (ningún
-- RPC de Torneos generaba notificaciones hasta ahora). Reutiliza
-- exactamente la tabla `notifications` y el patrón ya usado por
-- join_request_created/approved/rejected y reservation_request_created/
-- rejected (INSERT directo, SECURITY DEFINER, dentro de la misma
-- transacción que el cambio de estado) — nunca un mecanismo paralelo.
--
-- Tres helpers privados (prefijo `_`, REVOKE ALL FROM PUBLIC, nunca
-- GRANT a authenticated — mismo patrón que _require_club_not_archived/
-- _close_tournament_registration_for_capacity) encapsulan los tres
-- patrones de destinatario pedidos:
--   _notify_club_admins                 → OWNER/ADMIN activos del club
--   _notify_eligible_tournament_players  → PLAYER activos cuya categoría
--                                          coincide con category/secondary_category
--   _notify_tournament_entry_players     → los miembros activos de una
--                                          dupla, con exclusión opcional
--
-- Idempotencia / anti-duplicados: NO se agrega ningún mecanismo nuevo.
-- Cada llamada a notificar vive inmediatamente después de un UPDATE
-- compare-and-swap ya existente (WHERE status = <estado esperado> +
-- GET DIAGNOSTICS/IF NOT FOUND que aborta con RAISE EXCEPTION). Un
-- reintento de la misma acción sobre una transición ya aplicada nunca
-- llega a la línea de notificación — falla antes, en el mismo guard que
-- ya protegía la operación. finalize_tournament's ya tenía su propio
-- guard de "already_finalized" con RETURN anticipado; la notificación
-- vive dentro del mismo bloque que aplica puntos, que ese guard ya hace
-- inalcanzable en una repetición.
--
-- Bonus incidental: 4 de las funciones tocadas aquí (confirm_tournament_
-- entry, reject_tournament_entry, replace_tournament_entry_member,
-- finalize_tournament) todavía tenían el bug de columna ambigua
-- "club_id" ya corregido en sus funciones hermanas (create_tournament,
-- open/close/reopen_registration, register_entry, cancel_tournament,
-- start_tournament, set_entry_points, withdraw_entry — la última tanda
-- vía 20261021000001_tournament_lifecycle_archive_columns.sql) pero
-- nunca parcheado en estas 4 — el mismo NOT EXISTS (SELECT 1 FROM
-- public.club_members WHERE club_id = ...) sin alias, ambiguo contra la
-- columna de salida "club_id" de su propio RETURNS TABLE. Como esta
-- migración ya reescribe el cuerpo completo de esas 4 funciones para
-- agregar las notificaciones, se corrige aquí mismo (alias cm2, igual
-- que en las funciones ya corregidas) en vez de dejar un bug conocido
-- intacto en una función que de todos modos se está tocando por
-- completo. reopen_tournament_registration ya llegaba con ese mismo bug
-- corregido desde 20261021000001 — esta migración solo lo conserva.
--
-- RETURNS TABLE: cada función mantiene exactamente su lista de columnas
-- real vigente — verificada leyendo la migración más reciente de cada
-- una, no la versión original. En particular, open_tournament_
-- registration, reopen_tournament_registration y start_tournament
-- reflejan a v_tournament con SELECT *, así que sus RETURNS TABLE ya
-- incluyen archived_at/archived_by desde
-- 20261021000001_tournament_lifecycle_archive_columns.sql — se
-- preservan aquí sin cambio de tipo de retorno respecto a esa
-- definición (por lo que un simple CREATE OR REPLACE basta, sin DROP
-- FUNCTION). register_tournament_entry/confirm/reject/withdraw/
-- replace_tournament_entry_member/finalize_tournament reflejan
-- tournament_entries (nunca ganó esas columnas — ver el propio
-- comentario de 20261021000001) y no las llevan, tampoco aquí. Ninguna
-- columna nueva ni tipo de retorno cambia frente a lo vigente.
-- ============================================================


-- ─── Helper 1: notificar OWNER/ADMIN activos del club ──────────────────────
CREATE OR REPLACE FUNCTION public._notify_club_admins(
  p_club_id  uuid,
  p_type     text,
  p_title    text,
  p_message  text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT DISTINCT cm.profile_id, p_club_id, p_type, p_title, p_message, p_metadata
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public._notify_club_admins(uuid, text, text, text, jsonb) FROM PUBLIC;


-- ─── Helper 2: notificar PLAYER elegibles por categoría del torneo ─────────
-- Mismo join que register_tournament_entry usa para validar categoría
-- (club_member_sport_state + ciclo de ranking activo, ended_at IS NULL) —
-- nunca una segunda fórmula de elegibilidad.
CREATE OR REPLACE FUNCTION public._notify_eligible_tournament_players(
  p_tournament_id uuid,
  p_type          text,
  p_title         text,
  p_message       text,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id            uuid;
  v_category           text;
  v_secondary_category text;
BEGIN
  SELECT t.club_id, t.category, t.secondary_category
  INTO v_club_id, v_category, v_secondary_category
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT DISTINCT cm.profile_id, v_club_id, p_type, p_title, p_message, p_metadata
  FROM public.club_members AS cm
  JOIN public.club_member_sport_state AS s ON s.club_member_id = cm.id
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE cm.club_id = v_club_id
    AND cm.role = 'PLAYER'
    AND cm.is_active = true
    AND c.category IN (v_category, v_secondary_category);
END;
$$;

REVOKE ALL ON FUNCTION public._notify_eligible_tournament_players(uuid, text, text, text, jsonb) FROM PUBLIC;


-- ─── Helper 3: notificar a los miembros activos de una dupla ───────────────
-- p_exclude_club_member_id: omite a un miembro puntual (retiro voluntario
-- — nunca notificar a quien ejecutó la acción). NULL (default) notifica
-- a los dos.
CREATE OR REPLACE FUNCTION public._notify_tournament_entry_players(
  p_tournament_entry_id     uuid,
  p_type                    text,
  p_title                   text,
  p_message                 text,
  p_metadata                jsonb DEFAULT '{}'::jsonb,
  p_exclude_club_member_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT DISTINCT cm.profile_id, tem.club_id, p_type, p_title, p_message, p_metadata
  FROM public.tournament_entry_members AS tem
  JOIN public.club_members AS cm ON cm.id = tem.club_member_id
  WHERE tem.tournament_entry_id = p_tournament_entry_id
    AND tem.is_active = true
    AND (p_exclude_club_member_id IS NULL OR tem.club_member_id <> p_exclude_club_member_id);
END;
$$;

REVOKE ALL ON FUNCTION public._notify_tournament_entry_players(uuid, text, text, text, jsonb, uuid) FROM PUBLIC;


-- ─── _close_tournament_registration_for_capacity ───────────────────────────
-- Evento 7: rechazo automático en bloque por cupo completo. Captura los
-- ids que están por rechazarse ANTES del UPDATE masivo (mientras siguen
-- 'pending'), y notifica cada dupla después de que el UPDATE confirma el
-- rechazo — mismo patrón "notificar después del cambio de estado exitoso"
-- que el resto de esta migración.
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
  v_tournament      public.tournaments%ROWTYPE;
  v_club_slug       text;
  v_rejected_ids    uuid[];
  v_entry_id        uuid;
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

  SELECT array_agg(te.id) INTO v_rejected_ids
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'pending';

  UPDATE public.tournament_entries AS te
  SET status = 'rejected', rejected_at = now(), rejected_by = p_actor,
      rejection_reason = 'capacity_reached'
  WHERE te.tournament_id = p_tournament_id AND te.status = 'pending';

  IF v_rejected_ids IS NOT NULL AND array_length(v_rejected_ids, 1) > 0 THEN
    SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;
    SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

    FOREACH v_entry_id IN ARRAY v_rejected_ids LOOP
      PERFORM public._notify_tournament_entry_players(
        v_entry_id,
        'tournament_entry_rejected',
        'Inscripción rechazada',
        'No fue posible confirmar tu inscripción al torneo "' || v_tournament.name || '" porque se completó el cupo.',
        jsonb_build_object(
          'tournament_id', p_tournament_id,
          'tournament_entry_id', v_entry_id,
          'reason', 'capacity_reached',
          'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
        )
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._close_tournament_registration_for_capacity(uuid, integer, uuid) FROM PUBLIC;


-- ─── open_tournament_registration ──────────────────────────────────────────
-- Evento 1. Cuerpo byte-idéntico a 20261014000001 (ya correctamente
-- aliasado) salvo la llamada a _notify_eligible_tournament_players al
-- final, dentro de la misma transacción que el UPDATE draft→registration_open.
CREATE OR REPLACE FUNCTION public.open_tournament_registration(p_tournament_id uuid)
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
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
  v_club_slug     text;
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
     OR v_tournament.starts_at IS NULL OR v_tournament.estimated_duration_minutes IS NULL THEN
    RAISE EXCEPTION 'Tournament schedule is not fully configured' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_open'
  WHERE t.id = p_tournament_id AND t.status = 'draft';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament is no longer in draft' USING ERRCODE = '22023';
  END IF;

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  PERFORM public._notify_eligible_tournament_players(
    p_tournament_id,
    'tournament_registration_open',
    'Nuevo torneo disponible',
    'Ya puedes inscribirte al torneo "' || v_tournament.name || '". ¡No te quedes por fuera!',
    jsonb_build_object(
      'tournament_id', p_tournament_id,
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    )
  );

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


-- ─── reopen_tournament_registration ────────────────────────────────────────
-- Evento 2. Mismos destinatarios/criterio que la apertura (reutiliza el
-- mismo helper y el mismo `type`). Incidentalmente corrige aquí el bug de
-- columna ambigua "club_id" (nunca parcheado para esta función — ver
-- comentario de cabecera).
CREATE OR REPLACE FUNCTION public.reopen_tournament_registration(p_tournament_id uuid)
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
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
  v_club_slug     text;
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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  PERFORM public._notify_eligible_tournament_players(
    p_tournament_id,
    'tournament_registration_open',
    'Inscripciones reabiertas',
    'Las inscripciones para el torneo "' || v_tournament.name || '" se reabrieron. ¡Inscríbete!',
    jsonb_build_object(
      'tournament_id', p_tournament_id,
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    )
  );

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


-- ─── register_tournament_entry ─────────────────────────────────────────────
-- Eventos 3 y 4. Cuerpo byte-idéntico a 20261016000001 (ya correctamente
-- aliasado) salvo: dos nombres de jugador resueltos para el mensaje de
-- OWNER/ADMIN, el club_slug, y la notificación al final de cada rama
-- (PLAYER→pending notifica a OWNER/ADMIN; OWNER/ADMIN→confirmed notifica
-- a ambos jugadores).
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
  v_tournament      public.tournaments%ROWTYPE;
  v_caller_member   public.club_members%ROWTYPE;
  v_member_one      public.club_members%ROWTYPE;
  v_member_two      public.club_members%ROWTYPE;
  v_category_one    text;
  v_category_two    text;
  v_high_count      int;
  v_lock_first      uuid;
  v_lock_second     uuid;
  v_conflict_count  int;
  v_entry_count     int;
  v_entry           public.tournament_entries%ROWTYPE;
  v_is_admin        boolean;
  v_club_slug       text;
  v_member_one_name text;
  v_member_two_name text;
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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  IF v_is_admin THEN
    PERFORM public._notify_tournament_entry_players(
      v_entry.id,
      'tournament_entry_confirmed',
      'Inscripción confirmada',
      'Fuiste inscrito en el torneo "' || v_tournament.name || '".',
      jsonb_build_object(
        'tournament_id', p_tournament_id,
        'tournament_entry_id', v_entry.id,
        'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
      )
    );
  ELSE
    SELECT p.full_name INTO v_member_one_name FROM public.profiles AS p WHERE p.id = v_member_one.profile_id;
    SELECT p.full_name INTO v_member_two_name FROM public.profiles AS p WHERE p.id = v_member_two.profile_id;

    PERFORM public._notify_club_admins(
      v_tournament.club_id,
      'tournament_entry_created',
      'Nueva solicitud de inscripción',
      COALESCE(v_member_one_name, 'Un jugador') || ' y ' || COALESCE(v_member_two_name, 'un jugador') ||
        ' solicitaron inscribirse al torneo "' || v_tournament.name || '".',
      jsonb_build_object(
        'tournament_id', p_tournament_id,
        'tournament_entry_id', v_entry.id,
        'destination', '/' || v_club_slug || '/admin/tournaments/' || v_tournament.slug
      )
    );
  END IF;

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


-- ─── confirm_tournament_entry ──────────────────────────────────────────────
-- Evento 5. Corrige incidentalmente el mismo bug de columna ambigua
-- "club_id" (ver comentario de cabecera) y agrega la notificación a
-- ambos jugadores tras la confirmación.
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
  v_club_slug      text;
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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  PERFORM public._notify_tournament_entry_players(
    p_tournament_entry_id,
    'tournament_entry_confirmed',
    'Inscripción confirmada',
    'Tu solicitud de inscripción al torneo "' || v_tournament.name || '" fue aprobada.',
    jsonb_build_object(
      'tournament_id', v_tournament_id,
      'tournament_entry_id', p_tournament_entry_id,
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    )
  );

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


-- ─── reject_tournament_entry ────────────────────────────────────────────────
-- Evento 6. Corrige incidentalmente el mismo bug de columna ambigua
-- "club_id" y agrega la notificación a ambos jugadores, incluyendo el
-- motivo (p_reason, ya obligatorio en esta función).
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
  v_club_slug      text;
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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  PERFORM public._notify_tournament_entry_players(
    p_tournament_entry_id,
    'tournament_entry_rejected',
    'Inscripción rechazada',
    'Tu solicitud de inscripción al torneo "' || v_tournament.name || '" fue rechazada. Motivo: ' || v_reason,
    jsonb_build_object(
      'tournament_id', v_tournament_id,
      'tournament_entry_id', p_tournament_entry_id,
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    )
  );

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;


-- ─── withdraw_tournament_entry ─────────────────────────────────────────────
-- Eventos 8 y 9. Cuerpo byte-idéntico a 20261022000001 (ya correctamente
-- aliasado) salvo la notificación final: PLAYER excluye su propio
-- club_member.id (nunca notifica a quien ejecutó el retiro); OWNER/ADMIN
-- no excluye a nadie.
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
  v_club_slug      text;
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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  PERFORM public._notify_tournament_entry_players(
    p_tournament_entry_id,
    'tournament_entry_withdrawn',
    CASE WHEN v_caller_member.role = 'PLAYER' THEN 'Tu compañero se retiró' ELSE 'Inscripción retirada' END,
    CASE
      WHEN v_caller_member.role = 'PLAYER'
        THEN 'Tu compañero de dupla se retiró del torneo "' || v_tournament.name || '".'
      ELSE 'Tu inscripción al torneo "' || v_tournament.name || '" fue retirada por el club.'
    END,
    jsonb_build_object(
      'tournament_id', v_tournament_id,
      'tournament_entry_id', p_tournament_entry_id,
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    ),
    CASE WHEN v_caller_member.role = 'PLAYER' THEN v_caller_member.id ELSE NULL END
  );

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;


-- ─── replace_tournament_entry_member ───────────────────────────────────────
-- Evento 11. Corrige incidentalmente el mismo bug de columna ambigua
-- "club_id". Notifica individualmente a saliente/entrante/compañero
-- (mensajes distintos, mismo `type`) — el saliente se resuelve ANTES del
-- UPDATE que lo desactiva, porque _notify_tournament_entry_players solo
-- ve miembros con is_active = true.
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
  v_entry              public.tournament_entries%ROWTYPE;
  v_tournament         public.tournaments%ROWTYPE;
  v_caller_member      public.club_members%ROWTYPE;
  v_new_member         public.club_members%ROWTYPE;
  v_partner_member_id  uuid;
  v_new_category       text;
  v_partner_category   text;
  v_old_row_exists     boolean;
  v_lock_first         uuid;
  v_lock_second        uuid;
  v_conflict_count     int;
  v_updated_count      int;
  v_new_row            public.tournament_entry_members%ROWTYPE;
  v_old_profile_id     uuid;
  v_partner_profile_id uuid;
  v_club_slug          text;
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

  SELECT cm3.profile_id INTO v_old_profile_id FROM public.club_members AS cm3 WHERE cm3.id = p_old_club_member_id;
  SELECT cm4.profile_id INTO v_partner_profile_id FROM public.club_members AS cm4 WHERE cm4.id = v_partner_member_id;

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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    v_old_profile_id, v_tournament.club_id, 'tournament_entry_member_replaced', 'Saliste del torneo',
    'Fuiste reemplazado en tu dupla del torneo "' || v_tournament.name || '".',
    jsonb_build_object(
      'tournament_id', v_tournament.id, 'tournament_entry_id', p_tournament_entry_id, 'role', 'outgoing',
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    )
  );

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    v_new_member.profile_id, v_tournament.club_id, 'tournament_entry_member_replaced', 'Fuiste inscrito',
    'Fuiste agregado a una dupla del torneo "' || v_tournament.name || '".',
    jsonb_build_object(
      'tournament_id', v_tournament.id, 'tournament_entry_id', p_tournament_entry_id, 'role', 'incoming',
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    )
  );

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    v_partner_profile_id, v_tournament.club_id, 'tournament_entry_member_replaced', 'Cambio en tu dupla',
    'Tu compañero de dupla cambió en el torneo "' || v_tournament.name || '".',
    jsonb_build_object(
      'tournament_id', v_tournament.id, 'tournament_entry_id', p_tournament_entry_id, 'role', 'partner',
      'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
    )
  );

  RETURN QUERY SELECT
    v_new_row.id, v_new_row.tournament_entry_id, v_new_row.tournament_id, v_new_row.club_id,
    v_new_row.club_member_id, v_new_row.is_active, v_new_row.replaced_at, v_new_row.replaced_by,
    v_new_row.created_at;
END;
$$;


-- ─── start_tournament ───────────────────────────────────────────────────────
-- Evento 10. Cuerpo byte-idéntico a 20261018000001 (ya correctamente
-- aliasado) salvo el loop final que notifica a los jugadores de cada
-- dupla confirmada.
CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id uuid)
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
  v_tournament          public.tournaments%ROWTYPE;
  v_confirmed_count     int;
  v_updated_count       int;
  v_club_slug           text;
  v_confirmed_entry_id  uuid;
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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  FOR v_confirmed_entry_id IN
    SELECT te.id FROM public.tournament_entries AS te
    WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed'
  LOOP
    PERFORM public._notify_tournament_entry_players(
      v_confirmed_entry_id,
      'tournament_started',
      'El torneo comenzó',
      'El torneo "' || v_tournament.name || '" ha comenzado. ¡Mucha suerte!',
      jsonb_build_object(
        'tournament_id', p_tournament_id,
        'tournament_entry_id', v_confirmed_entry_id,
        'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
      )
    );
  END LOOP;

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


-- ─── finalize_tournament ────────────────────────────────────────────────────
-- Evento 12. Corrige incidentalmente el mismo bug de columna ambigua
-- "club_id". Notifica a ambos jugadores de cada dupla confirmada con su
-- posición (misma semántica jump-on-tie de computeTournamentClassification
-- — puntos desc, created_at asc como desempate — expresada en SQL como un
-- conteo correlacionado) y sus puntos. La notificación vive DENTRO del
-- bloque que aplica puntos, que el guard de "already_finalized" (arriba,
-- con RETURN anticipado) ya vuelve inalcanzable en una repetición —
-- ninguna notificación nueva en un re-llamado.
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
  v_club_slug           text;
  v_position            integer;
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

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

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

    -- Posición jump-on-tie: mismas reglas de desempate que
    -- computeTournamentClassification (puntos desc, created_at asc) —
    -- conteo correlacionado de duplas confirmadas que superan a esta.
    SELECT count(*) + 1 INTO v_position
    FROM public.tournament_entries AS te2
    WHERE te2.tournament_id = p_tournament_id AND te2.status = 'confirmed'
      AND (te2.points > v_entry.points OR (te2.points = v_entry.points AND te2.created_at < v_entry.created_at));

    PERFORM public._notify_tournament_entry_players(
      v_entry_id,
      'tournament_completed',
      'Torneo finalizado',
      'El torneo "' || v_tournament.name || '" finalizó. Quedaste en la posición ' || v_position ||
        ' con ' || v_entry.points || ' puntos.',
      jsonb_build_object(
        'tournament_id', p_tournament_id,
        'tournament_entry_id', v_entry_id,
        'position', v_position,
        'points', v_entry.points,
        'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
      )
    );
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
