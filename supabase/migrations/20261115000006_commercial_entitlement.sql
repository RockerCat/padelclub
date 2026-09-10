-- ============================================================
-- Comercial v2 / Fase 2 — Entitlement para Reservas y Torneos
-- Mi Pádel Club
-- ============================================================
-- Bloquea ÚNICAMENTE la creación de una reserva nueva o un torneo nuevo
-- cuando el club está comercialmente `suspended`. No bloquea ni oculta
-- login, dashboard, ranking, miembros, perfiles, canchas, configuración,
-- reservas/torneos existentes (pasados o futuros), resultados, ni ninguna
-- consulta de información. No cancela ni modifica nada existente. No
-- convierte una suspensión comercial en desactivación operativa del club
-- (`clubs.is_active` nunca se lee ni se escribe aquí).
--
-- Regla, por status de club_subscriptions:
--   • sin fila (club legacy, creado antes de Comercial v2)  → permitido
--   • 'trialing'                                            → permitido
--   • 'active'                                               → permitido
--   • 'suspended'                                            → BLOQUEADO
--   • 'past_due' / 'cancelled'                               → sin decisión
--     de producto explícita todavía (ver auditoría del reporte de esta
--     fase) — por ahora se tratan como PERMITIDO (mismo default seguro que
--     "sin suscripción"), nunca como bloqueo inventado. Ningún camino de
--     código produce estos dos estados hoy, así que esto no tiene efecto
--     observable todavía; queda documentado aquí para que el día que
--     alguna transición automática empiece a producirlos, este es el único
--     lugar que hay que revisar.
--
-- Ningún bypass especial para SUPERADMIN: tanto la fila OWNER temporal de
-- Entrega de Club (pending_claim=true, sin suscripción todavía → permitido
-- por la regla "sin fila" de todas formas) como el acceso elevado
-- ("Entrar al club" sobre un club ya reclamado) quedan sujetos a la misma
-- regla que cualquier OWNER real — no se detectó una necesidad real de
-- bypass de soporte; si aparece, es una decisión a reportar antes de
-- implementarla, no a asumir aquí.
-- ============================================================

-- ─── _require_commercial_access — guard interno, mismo patrón que ─────────
-- _require_club_not_archived (20261006000002): SECURITY DEFINER, sin
-- ningún GRANT a rol de cliente, se llama desde dentro de cada RPC que
-- crea el recurso real, lo más cerca posible del INSERT.
CREATE OR REPLACE FUNCTION public._require_commercial_access(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_status text;
BEGIN
  SELECT cs.status INTO v_status
  FROM public.club_subscriptions AS cs
  WHERE cs.club_id = p_club_id;

  -- Sin suscripción: compatibilidad transitoria deliberada para clubes
  -- creados antes de Comercial v2 — nunca bloquear por ausencia de fila,
  -- nunca inicializar un trial aquí (eso solo ocurre en claim_club()).
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'commercial_access_denied' USING ERRCODE = 'P0008';
  END IF;

  -- trialing/active/past_due/cancelled: permitido (ver nota de cabecera
  -- sobre past_due/cancelled).
END;
$$;

REVOKE ALL ON FUNCTION public._require_commercial_access(uuid) FROM PUBLIC, anon, authenticated;

-- ─── get_club_commercial_access — fuente central de lectura ───────────────
-- Cualquier miembro real del club (PLAYER incluido, para poder deshabilitar
-- su propio CTA de "Nueva reserva") o SUPERADMIN con acceso elevado puede
-- leer esto — gateado con effective_club_role, el mismo helper que ya usa
-- el resto de RPCs operativas del club (nunca club_role a secas, que
-- ignora el acceso elevado de SUPERADMIN).
CREATE OR REPLACE FUNCTION public.get_club_commercial_access(p_club_id uuid)
RETURNS TABLE (
  commercial_status     text,
  has_subscription      boolean,
  can_create_booking    boolean,
  can_create_tournament boolean,
  trial_ends_at         timestamptz
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_status        text;
  v_trial_ends_at timestamptz;
  v_allowed       boolean;
BEGIN
  IF public.effective_club_role(p_club_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this club' USING ERRCODE = '42501';
  END IF;

  SELECT cs.status, cs.trial_ends_at INTO v_status, v_trial_ends_at
  FROM public.club_subscriptions AS cs
  WHERE cs.club_id = p_club_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, false, true, true, NULL::timestamptz;
    RETURN;
  END IF;

  -- Misma regla que _require_commercial_access — deliberadamente separada
  -- (una levanta excepción, la otra devuelve booleanos), pero ambas deben
  -- cambiar juntas si esta regla cambia.
  v_allowed := (v_status IS DISTINCT FROM 'suspended');

  RETURN QUERY SELECT v_status, true, v_allowed, v_allowed, v_trial_ends_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_commercial_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_commercial_access(uuid) TO authenticated;

-- ─── create_reservation_player — + _require_commercial_access ─────────────
-- Reproduce por completo la versión vigente (20261031000001) — único
-- cambio: una línea nueva justo después de _require_club_not_archived.
CREATE OR REPLACE FUNCTION public.create_reservation_player(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_is_open boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_hours_error   text;
  v_has_conflict  boolean;
  v_price         record;
  v_new_start_at  timestamptz;
  v_reservation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.club_role(p_club_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);
  PERFORM public._require_commercial_access(p_club_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.courts WHERE id = p_court_id AND club_id = p_club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  v_new_start_at := (p_date + p_start_time) AT TIME ZONE 'America/Bogota';
  IF v_new_start_at <= now() THEN
    RAISE EXCEPTION 'Start time is in the past' USING ERRCODE = 'P0003';
  END IF;

  v_hours_error := public._check_operating_hours(p_club_id, p_date, p_start_time, p_duration_minutes);
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  PERFORM public._lock_court_date(p_court_id, p_date);

  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, NULL, ARRAY['pending', 'confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  SELECT * INTO v_price FROM public._resolve_reservation_price(
    p_club_id, p_court_id, p_date, p_start_time, p_duration_minutes
  );
  IF NOT v_price.o_matched THEN
    RAISE EXCEPTION 'No pricing rule configured for this time' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.reservations (
    club_id, court_id, created_by, date, start_time, duration_minutes, type, status,
    price_amount, price_currency, pricing_rule_id, price_calculated_at,
    is_open, closed_reason
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, 'match', 'pending',
    v_price.o_price_amount, v_price.o_price_currency, v_price.o_pricing_rule_id, now(),
    p_is_open, CASE WHEN p_is_open THEN NULL ELSE 'manual' END
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer, boolean) TO authenticated;

-- ─── create_reservation_admin — + _require_commercial_access ──────────────
-- Reproduce por completo la versión vigente (20261031000001) — único
-- cambio: una línea nueva justo después de _require_club_not_archived.
CREATE OR REPLACE FUNCTION public.create_reservation_admin(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_type text,
  p_title text,
  p_notes text,
  p_is_open boolean DEFAULT false,
  p_player_count integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_hours_error    text;
  v_has_conflict   boolean;
  v_new_start_at   timestamptz;
  v_reservation_id uuid;
  v_effective_open boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.effective_club_role(p_club_id), '') NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to create reservations for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);
  PERFORM public._require_commercial_access(p_club_id);

  IF p_type NOT IN ('match', 'class', 'block') THEN
    RAISE EXCEPTION 'Invalid reservation type' USING ERRCODE = 'P0003';
  END IF;
  IF p_type = 'block' AND (p_title IS NULL OR btrim(p_title) = '') THEN
    RAISE EXCEPTION 'Title is required for a block' USING ERRCODE = 'P0003';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts WHERE id = p_court_id AND club_id = p_club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  v_new_start_at := (p_date + p_start_time) AT TIME ZONE 'America/Bogota';
  IF v_new_start_at <= now() THEN
    RAISE EXCEPTION 'Start time is in the past' USING ERRCODE = 'P0003';
  END IF;

  v_hours_error := public._check_operating_hours(p_club_id, p_date, p_start_time, p_duration_minutes);
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  PERFORM public._lock_court_date(p_court_id, p_date);

  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, NULL, ARRAY['confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  v_effective_open := p_is_open AND COALESCE(p_player_count, 0) < 4;

  INSERT INTO public.reservations (
    club_id, court_id, created_by, date, start_time, duration_minutes, type, status, title, notes,
    is_open, closed_reason
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, p_type, 'confirmed', p_title, p_notes,
    v_effective_open,
    CASE
      WHEN v_effective_open THEN NULL
      WHEN COALESCE(p_player_count, 0) >= 4 THEN 'auto_full'
      ELSE 'manual'
    END
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text, boolean, integer) TO authenticated;

-- ─── create_tournament — + _require_commercial_access ─────────────────────
-- Reproduce por completo la versión vigente (20261028000001) — único
-- cambio: una línea nueva justo después de _require_club_not_archived.
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
  PERFORM public._require_commercial_access(p_club_id);

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
