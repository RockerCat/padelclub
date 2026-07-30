-- ============================================================
-- Modelo estructural para torneos de categorías combinadas
-- (Bloque 2.2.1A, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Auditoría previa (obligatoria, confirmada antes de este archivo):
-- public.tournaments y public.tournament_entries solo tenían una columna
-- `category` (un único código FK a sport_categories.code) — no existía
-- ningún campo de modalidad ni de categoría secundaria en ningún lugar
-- del esquema, del código de aplicación ni de la documentación (grep
-- exhaustivo sin resultados). Este archivo agrega, de forma puramente
-- aditiva, la representación mínima necesaria:
--
--   secondary_category text NULL REFERENCES sport_categories(code)
--
-- en ambas tablas. NULL = torneo/entry de categoría única (comportamiento
-- histórico preservado sin migrar ningún dato); NOT NULL = combinado.
-- Convención (aprobada explícitamente, no inferida): `category` es
-- siempre la categoría superior (o la única, si no hay combinación);
-- `secondary_category` es siempre la inferior. La superioridad se exige
-- por sort_order real de sport_categories — nunca comparación de
-- strings, nunca el número dentro del código, nunca una suma.
--
-- Este bloque NO valida todavía la composición de categorías de los dos
-- JUGADORES de una pareja (eso es 2.2.1B) — aquí solo se garantiza que
-- la MODALIDAD del torneo (qué dos categorías admite, y en qué orden)
-- quede representada de forma inequívoca y se congele correctamente en
-- cada tournament_entry.
--
-- Tres funciones reemplazadas, ninguna otra tocada:
--   - create_tournament: nuevo parámetro opcional p_secondary_category
--     (DEFAULT NULL, al final — mismo patrón ya usado por los demás
--     parámetros opcionales de esta función), con validación de
--     combinación.
--   - update_tournament: nuevo parámetro p_secondary_category, sin
--     DEFAULT — esta función nunca tuvo semántica de "actualización
--     parcial" (los 10 parámetros existentes ya son un full-replace
--     obligatorio, sin ningún COALESCE "si se omite, conservar el valor
--     anterior"), así que añadir un onceavo parámetro obligatorio sigue
--     exactamente la misma convención sin introducir ninguna ambigüedad
--     nueva entre "omitido" y "NULL explícito" — ambigüedad que de todas
--     formas no existe en ningún parámetro de esta función hoy.
--     Mismo congelamiento por estado que category/bracket_size/
--     registration_opens_at: si el torneo está en registration_open,
--     secondary_category tampoco puede cambiar.
--   - register_tournament_entry: firma idéntica (sin nuevo parámetro,
--     tal como pide la instrucción) — únicamente copia
--     tournament.secondary_category (ya bloqueado por el FOR UPDATE
--     existente) hacia el nuevo campo de tournament_entries, en las dos
--     ramas de INSERT (confirmed y pending) que ya existían. Ninguna
--     otra línea de esta función se modifica: autorización, capacidad,
--     locks, duplicados y el estado inicial pending/confirmed quedan
--     byte-a-byte iguales.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────
-- 1. ALTER TABLE — tournaments
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tournaments
  ADD COLUMN secondary_category text NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_secondary_category_distinct
  CHECK (secondary_category IS NULL OR secondary_category <> category);


-- ────────────────────────────────────────────────────────────────────────
-- 2. ALTER TABLE — tournament_entries
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tournament_entries
  ADD COLUMN secondary_category text NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT;

ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_secondary_category_distinct
  CHECK (secondary_category IS NULL OR secondary_category <> category);


-- ────────────────────────────────────────────────────────────────────────
-- 3. create_tournament — nuevo parámetro opcional + validación de combinación
-- ────────────────────────────────────────────────────────────────────────

-- PostgreSQL no permite reemplazar limpiamente esta RPC dejando viva la
-- firma anterior: el nuevo parámetro final crea una sobrecarga distinta.
-- Se elimina la versión previa para evitar firmas ambiguas en PostgREST.
DROP FUNCTION IF EXISTS public.create_tournament(
  uuid, text, text, integer, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.create_tournament(
  p_club_id                 uuid,
  p_name                    text,
  p_category                text,
  p_bracket_size            integer,
  p_description             text DEFAULT NULL,
  p_visibility              text DEFAULT 'private',
  p_registration_opens_at   timestamptz DEFAULT NULL,
  p_registration_closes_at  timestamptz DEFAULT NULL,
  p_starts_at               timestamptz DEFAULT NULL,
  p_ends_at                 timestamptz DEFAULT NULL,
  p_secondary_category      text DEFAULT NULL
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz,
  secondary_category      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_name           text;
  v_description    text;
  v_tournament     public.tournaments%ROWTYPE;
  v_primary_sort   smallint;
  v_secondary_sort smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tournament name cannot be blank' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  -- Combinación de categorías — solo cuando se solicita una secundaria.
  -- category es siempre la superior, secondary_category la inferior;
  -- superioridad exigida por sort_order real (nunca string, nunca el
  -- número del código, nunca una suma), nunca intercambiado en silencio.
  IF p_secondary_category IS NOT NULL THEN
    IF p_secondary_category = p_category THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    SELECT sort_order INTO v_primary_sort FROM public.sport_categories WHERE code = p_category;
    SELECT sort_order INTO v_secondary_sort FROM public.sport_categories WHERE code = p_secondary_category;

    IF v_secondary_sort IS NULL THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    IF v_primary_sort <= v_secondary_sort THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_bracket_size IS NULL OR p_bracket_size NOT IN (4, 8, 16) THEN
    RAISE EXCEPTION 'Invalid bracket size' USING ERRCODE = '22023';
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
    club_id, name, description, category, bracket_size, visibility,
    registration_opens_at, registration_closes_at, starts_at, ends_at,
    created_by, secondary_category
  ) VALUES (
    p_club_id, v_name, v_description, p_category, p_bracket_size, p_visibility,
    p_registration_opens_at, p_registration_closes_at, p_starts_at, p_ends_at,
    auth.uid(), p_secondary_category
  )
  RETURNING * INTO v_tournament;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.bracket_size, v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at, v_tournament.bracket_generated_at,
    v_tournament.completed_at, v_tournament.completed_by, v_tournament.cancelled_at,
    v_tournament.cancelled_by, v_tournament.created_by, v_tournament.created_at,
    v_tournament.updated_at, v_tournament.secondary_category;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament(
  uuid, text, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tournament(
  uuid, text, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text
) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 4. update_tournament — nuevo parámetro obligatorio + mismas reglas de
--    congelamiento por estado que category/bracket_size/
--    registration_opens_at
-- ────────────────────────────────────────────────────────────────────────

-- La nueva firma agrega p_secondary_category. Se elimina la versión previa
-- para que no queden dos sobrecargas activas con contratos diferentes.
DROP FUNCTION IF EXISTS public.update_tournament(
  uuid, text, text, text, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.update_tournament(
  p_tournament_id           uuid,
  p_name                    text,
  p_description             text,
  p_category                text,
  p_bracket_size            integer,
  p_visibility              text,
  p_registration_opens_at   timestamptz,
  p_registration_closes_at  timestamptz,
  p_starts_at               timestamptz,
  p_ends_at                 timestamptz,
  p_secondary_category      text
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz,
  secondary_category      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_tournament     public.tournaments%ROWTYPE;
  v_name           text;
  v_description    text;
  v_updated_count  int;
  v_primary_sort   smallint;
  v_secondary_sort smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
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
    IF p_bracket_size IS DISTINCT FROM v_tournament.bracket_size THEN
      RAISE EXCEPTION 'bracket_size cannot change once registration is open' USING ERRCODE = '22023';
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

    IF v_secondary_sort IS NULL THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    IF v_primary_sort <= v_secondary_sort THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_bracket_size IS NULL OR p_bracket_size NOT IN (4, 8, 16) THEN
    RAISE EXCEPTION 'Invalid bracket size' USING ERRCODE = '22023';
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
      bracket_size = p_bracket_size,
      visibility = p_visibility,
      registration_opens_at = p_registration_opens_at,
      registration_closes_at = p_registration_closes_at,
      starts_at = p_starts_at,
      ends_at = p_ends_at
  WHERE t.id = p_tournament_id AND t.status = v_tournament.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.bracket_size, v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at, v_tournament.bracket_generated_at,
    v_tournament.completed_at, v_tournament.completed_by, v_tournament.cancelled_at,
    v_tournament.cancelled_by, v_tournament.created_by, v_tournament.created_at,
    v_tournament.updated_at, v_tournament.secondary_category;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, timestamptz, text
) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 5. register_tournament_entry — firma idéntica; solo copia
--    tournament.secondary_category (ya bloqueado por el FOR UPDATE
--    existente) hacia tournament_entries.secondary_category. Ninguna
--    otra línea cambia: autorización, capacidad, locks, duplicados y el
--    estado inicial pending/confirmed quedan idénticos.
-- ────────────────────────────────────────────────────────────────────────

-- Esta RPC conserva la misma firma de entrada, pero cambia su RETURNS TABLE
-- agregando secondary_category. PostgreSQL exige DROP + CREATE para cambiar
-- el row type definido por parámetros OUT (evita el error 42P13).
DROP FUNCTION IF EXISTS public.register_tournament_entry(uuid, uuid, uuid);

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
  status             text,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz,
  secondary_category text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_one     public.club_members%ROWTYPE;
  v_member_two     public.club_members%ROWTYPE;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_conflict_count int;
  v_entry_count    int;
  v_entry          public.tournament_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Tournament registration is not open' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.registration_opens_at > now() THEN
    RAISE EXCEPTION 'Tournament registration has not opened yet' USING ERRCODE = '22023';
  END IF;

  IF NOT (now() < v_tournament.registration_closes_at) THEN
    RAISE EXCEPTION 'Tournament registration window has closed' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id IS NULL OR p_club_member_two_id IS NULL THEN
    RAISE EXCEPTION 'Both players are required' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id = p_club_member_two_id THEN
    RAISE EXCEPTION 'The two players must be different' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> p_club_member_one_id AND v_caller_member.id <> p_club_member_two_id THEN
      RAISE EXCEPTION 'A player can only register a pair they are part of' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member_one
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_one_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player one is not a member of this club' USING ERRCODE = '22023';
  END IF;
  IF v_member_one.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Player one does not have an active membership' USING ERRCODE = '22023';
  END IF;
  IF v_member_one.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can register for a tournament' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member_two
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_two_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player two is not a member of this club' USING ERRCODE = '22023';
  END IF;
  IF v_member_two.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Player two does not have an active membership' USING ERRCODE = '22023';
  END IF;
  IF v_member_two.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can register for a tournament' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id < p_club_member_two_id THEN
    v_lock_first := p_club_member_one_id;
    v_lock_second := p_club_member_two_id;
  ELSE
    v_lock_first := p_club_member_two_id;
    v_lock_second := p_club_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = p_tournament_id
    AND tem.club_member_id IN (p_club_member_one_id, p_club_member_two_id)
    AND te.status IN ('pending', 'confirmed');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_entry_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id
    AND te.status IN ('pending', 'confirmed');

  IF v_entry_count >= v_tournament.bracket_size THEN
    RAISE EXCEPTION 'Tournament has reached its bracket size' USING ERRCODE = '22023';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, status, confirmed_at, confirmed_by, created_by, secondary_category
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, 'confirmed', now(), auth.uid(), auth.uid(),
      v_tournament.secondary_category
    )
    RETURNING * INTO v_entry;
  ELSE
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, status, created_by, secondary_category
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, 'pending', auth.uid(),
      v_tournament.secondary_category
    )
    RETURNING * INTO v_entry;
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_one_id),
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_two_id);

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.status,
    v_entry.confirmed_at, v_entry.confirmed_by, v_entry.withdrawn_at, v_entry.withdrawn_by,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at, v_entry.secondary_category;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) TO authenticated;
