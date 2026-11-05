-- ============================================================
-- Directorio de establecimientos de pádel ("Dónde jugar")
-- Mi Pádel Club
-- ============================================================
-- Un establecimiento puede existir en Mi Pádel Club SIN ser cliente del
-- SaaS: información comercial pública (nombre, dirección, contacto), sin
-- propietario, sin membresías, sin reservas, sin suscripción.
--
-- Decisión de modelo — entidad SEPARADA (padel_venues), no una variante de
-- `clubs`:
--   - `clubs` asume siempre un OWNER real (club_members), dispara la
--     provisión deportiva, participa de RLS por membresía, entitlement
--     comercial, slug reservado, branding y Entrega de Club. Un club sin
--     propietario rompería esas invariantes o exigiría propietarios
--     técnicos (prohibido).
--   - padel_venues.club_id (UNIQUE, nullable) es la relación estable con el
--     club SaaS cuando el establecimiento se vuelve cliente: el MISMO id de
--     directorio se conserva, así que las referencias de partidos abiertos
--     nunca cambian. Un establecimiento = una fila de directorio = a lo sumo
--     un club; el directorio público lo muestra una sola vez (como club
--     cuando el club está visible, como ficha neutral en otro caso).
--   - Nada aquí crea OWNER, ADMIN, club_members, claim links, leads ni
--     suscripciones. La conversión reutiliza platform_create_pending_club
--     (Entrega de Club) tal cual — el handoff al propietario definitivo
--     sigue siendo el flujo de claim existente, iniciado a mano por
--     SUPERADMIN.
--
-- Seguridad: RLS habilitado SIN políticas + privilegios de tabla revocados
-- (mismo patrón cerrado que commercial_leads/open_matches). Lecturas
-- públicas solo de fichas `published` y solo de campos públicos; toda
-- escritura pasa por funciones SECURITY DEFINER que verifican
-- profiles.is_platform_admin (mismo criterio que el resto de /platform).
-- Todas devuelven jsonb (sin RETURNS TABLE → sin ambigüedad 42702).
--
-- Partidos abiertos: open_matches.venue_id (nullable, ON DELETE RESTRICT).
-- Elegir un establecimiento NUNCA implica cancha reservada, disponibilidad
-- ni confirmación del establecimiento: court_status sigue siendo el único
-- indicador (declarado por el organizador) y no se toca.
-- ============================================================


-- ─── 1. Tabla ───────────────────────────────────────────────────────────

CREATE TABLE public.padel_venues (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  -- Claves normalizadas (minúsculas, sin tildes) — calculadas en servidor.
  name_key          text NOT NULL,
  department        text NOT NULL CHECK (char_length(department) BETWEEN 2 AND 60),
  department_key    text NOT NULL,
  municipality      text NOT NULL CHECK (char_length(municipality) BETWEEN 2 AND 60),
  -- Misma normalización que open_matches.city_key (_open_match_city_key),
  -- para poder exigir que el lugar elegido esté en la ciudad del partido.
  municipality_key  text NOT NULL,
  address           text CHECK (address IS NULL OR char_length(address) BETWEEN 3 AND 200),
  latitude          numeric(9, 6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude         numeric(9, 6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  -- Solo https y solo proveedores de mapas conocidos (ver _padel_venue_maps_url_ok).
  maps_url          text,
  -- Teléfonos colombianos normalizados: 57 + móvil (3xx) o fijo (60x).
  phone             text CHECK (phone IS NULL OR phone ~ '^57(3[0-9]{9}|60[0-9]{8})$'),
  whatsapp          text CHECK (whatsapp IS NULL OR whatsapp ~ '^57(3[0-9]{9}|60[0-9]{8})$'),
  -- Procedencia de los datos (p. ej. "Instagram oficial", "Ficha pública
  -- de Google Maps", "Llamada al establecimiento") + enlace opcional.
  source_label      text CHECK (source_label IS NULL OR char_length(source_label) BETWEEN 3 AND 200),
  source_url        text CHECK (source_url IS NULL OR (char_length(source_url) <= 500 AND source_url ~ '^https://[^[:space:]<>"''`]+$')),
  verified_at       date,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  -- Relación estable con el club SaaS (cuando el establecimiento es o se
  -- vuelve cliente). Nunca concede permisos: es solo una referencia.
  club_id           uuid UNIQUE REFERENCES public.clubs(id) ON DELETE RESTRICT,
  internal_notes    text CHECK (internal_notes IS NULL OR char_length(internal_notes) <= 1000),
  published_at      timestamptz,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT padel_venues_coords_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  -- Publicar exige dirección, procedencia y fecha de verificación.
  CONSTRAINT padel_venues_publishable CHECK (
    status <> 'published'
    OR (address IS NOT NULL AND source_label IS NOT NULL AND verified_at IS NOT NULL)
  )
);

-- Identidad comercial + ubicación: imposible duplicar exactamente el mismo
-- nombre en el mismo municipio/departamento (las variantes cercanas las
-- detecta platform_find_padel_venue_duplicates antes de crear).
CREATE UNIQUE INDEX padel_venues_identity_uidx
  ON public.padel_venues (name_key, municipality_key, department_key);

CREATE INDEX padel_venues_public_idx
  ON public.padel_venues (department_key, municipality_key)
  WHERE status = 'published';

ALTER TABLE public.padel_venues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.padel_venues FROM anon, authenticated;


-- ─── 2. Partidos abiertos → establecimiento ─────────────────────────────

ALTER TABLE public.open_matches
  ADD COLUMN venue_id uuid REFERENCES public.padel_venues(id) ON DELETE RESTRICT;

CREATE INDEX open_matches_venue_idx
  ON public.open_matches (venue_id)
  WHERE venue_id IS NOT NULL;


-- ─── 3. Helpers internos (sin GRANT a ningún rol cliente) ───────────────

-- "Club Pádel-Tunja " → "club padel tunja": minúsculas, sin tildes, solo
-- letras/dígitos separados por un espacio.
CREATE OR REPLACE FUNCTION public._padel_venue_name_key(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT btrim(regexp_replace(
    translate(lower(coalesce(p_value, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public._padel_venue_clean(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT NULLIF(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
$$;

-- Solo enlaces https a proveedores de mapas conocidos; sin espacios ni
-- caracteres que permitan romper un atributo HTML.
CREATE OR REPLACE FUNCTION public._padel_venue_maps_url_ok(p_url text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT p_url IS NOT NULL
     AND char_length(p_url) <= 500
     AND p_url ~ '^https://[^[:space:]<>"''`]+$'
     AND p_url ~* '^https://((www\.)?google\.com(\.co)?/maps|maps\.google\.com(\.co)?/|maps\.app\.goo\.gl/|goo\.gl/maps/|(www\.|ul\.)?waze\.com/|(www\.)?openstreetmap\.org/)';
$$;

ALTER TABLE public.padel_venues
  ADD CONSTRAINT padel_venues_maps_url_ok CHECK (maps_url IS NULL OR public._padel_venue_maps_url_ok(maps_url));

-- "+57 310 123 4567" / "310 1234567" / "(608) 7401234" → "573101234567" /
-- "576087401234". NULL si está vacío; 'invalid' si no es un número
-- colombiano reconocible (el llamador lo rechaza).
CREATE OR REPLACE FUNCTION public._padel_venue_phone(p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
BEGIN
  IF btrim(coalesce(p_value, '')) = '' THEN
    RETURN NULL;
  END IF;
  IF btrim(p_value) !~ '^\+?[0-9 ().-]+$' THEN
    RETURN 'invalid';
  END IF;
  IF char_length(v_digits) = 10 THEN
    v_digits := '57' || v_digits;
  END IF;
  IF v_digits ~ '^57(3[0-9]{9}|60[0-9]{8})$' THEN
    RETURN v_digits;
  END IF;
  RETURN 'invalid';
END;
$$;

CREATE OR REPLACE FUNCTION public._padel_venue_require_platform_admin()
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS me
    WHERE me.id = v_uid AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

-- Club SaaS vinculado, solo si está visible en el directorio público de
-- clubes (activo y no archivado — mismo criterio que /clubs). Devuelve
-- únicamente datos que /clubs ya expone a cualquiera (nombre, slug,
-- visibilidad). NULL en cualquier otro caso.
CREATE OR REPLACE FUNCTION public._padel_venue_public_club(p_club_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'visibility', c.visibility)
  FROM public.clubs AS c
  WHERE c.id = p_club_id AND c.is_active = true AND c.archived_at IS NULL;
$$;

-- Representación pública. Nunca incluye procedencia, notas internas,
-- autores ni fechas internas: solo datos comerciales públicos.
CREATE OR REPLACE FUNCTION public._padel_venue_public_json(p_venue public.padel_venues)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',           p_venue.id,
    'name',         p_venue.name,
    'department',   p_venue.department,
    'municipality', p_venue.municipality,
    'address',      p_venue.address,
    'latitude',     p_venue.latitude,
    'longitude',    p_venue.longitude,
    'maps_url',     p_venue.maps_url,
    'phone',        p_venue.phone,
    'whatsapp',     p_venue.whatsapp,
    'verified_at',  p_venue.verified_at,
    'club',         public._padel_venue_public_club(p_venue.club_id)
  );
$$;

-- Representación completa para SUPERADMIN.
CREATE OR REPLACE FUNCTION public._padel_venue_admin_json(p_venue public.padel_venues)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',             p_venue.id,
    'name',           p_venue.name,
    'department',     p_venue.department,
    'municipality',   p_venue.municipality,
    'address',        p_venue.address,
    'latitude',       p_venue.latitude,
    'longitude',      p_venue.longitude,
    'maps_url',       p_venue.maps_url,
    'phone',          p_venue.phone,
    'whatsapp',       p_venue.whatsapp,
    'source_label',   p_venue.source_label,
    'source_url',     p_venue.source_url,
    'verified_at',    p_venue.verified_at,
    'status',         p_venue.status,
    'internal_notes', p_venue.internal_notes,
    'published_at',   p_venue.published_at,
    'created_at',     p_venue.created_at,
    'updated_at',     p_venue.updated_at,
    'club_id',        p_venue.club_id,
    'club', (
      SELECT jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug,
        'is_active', c.is_active, 'archived', (c.archived_at IS NOT NULL),
        'pending_claim', c.pending_claim, 'visibility', c.visibility
      )
      FROM public.clubs AS c WHERE c.id = p_venue.club_id
    ),
    'match_count', (
      SELECT count(*)::integer FROM public.open_matches AS om WHERE om.venue_id = p_venue.id
    )
  );
$$;

REVOKE ALL ON FUNCTION public._padel_venue_name_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._padel_venue_clean(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._padel_venue_maps_url_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._padel_venue_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._padel_venue_require_platform_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._padel_venue_public_club(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._padel_venue_public_json(public.padel_venues) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._padel_venue_admin_json(public.padel_venues) FROM PUBLIC, anon, authenticated;


-- ─── 4. Lectura pública (anon + authenticated) ──────────────────────────

-- Fichas publicadas, filtrables por nombre (contiene), departamento y
-- municipio (exactos, normalizados). Orden: departamento, municipio, nombre.
CREATE OR REPLACE FUNCTION public.list_padel_venues(
  p_query        text DEFAULT NULL,
  p_department   text DEFAULT NULL,
  p_municipality text DEFAULT NULL,
  p_limit        integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_query  text := NULLIF(public._padel_venue_name_key(p_query), '');
  v_dept   text := NULLIF(public._open_match_city_key(p_department), '');
  v_muni   text := NULLIF(public._open_match_city_key(p_municipality), '');
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 500);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(public._padel_venue_public_json(x.v) ORDER BY x.department, x.municipality, x.name)
    FROM (
      SELECT pv AS v, pv.department, pv.municipality, pv.name
      FROM public.padel_venues AS pv
      WHERE pv.status = 'published'
        AND (v_query IS NULL OR pv.name_key LIKE '%' || v_query || '%')
        AND (v_dept IS NULL OR pv.department_key = v_dept)
        AND (v_muni IS NULL OR pv.municipality_key = v_muni)
      ORDER BY pv.department, pv.municipality, pv.name
      LIMIT v_limit
    ) AS x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_padel_venues(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_padel_venues(text, text, text, integer) TO anon, authenticated;


-- ─── 5. Administración SUPERADMIN (authenticated + check interno) ───────

CREATE OR REPLACE FUNCTION public.platform_list_padel_venues()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public._padel_venue_require_platform_admin();
  RETURN COALESCE((
    SELECT jsonb_agg(public._padel_venue_admin_json(pv) ORDER BY pv.department, pv.municipality, pv.name)
    FROM public.padel_venues AS pv
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_get_padel_venue(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_venue public.padel_venues;
BEGIN
  PERFORM public._padel_venue_require_platform_admin();
  SELECT pv.* INTO v_venue FROM public.padel_venues AS pv WHERE pv.id = p_venue_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public._padel_venue_admin_json(v_venue);
END;
$$;

-- Posibles duplicados antes de crear/editar: fichas del mismo municipio
-- con nombre igual o contenido uno en otro, o con la misma dirección; y
-- fichas en cualquier lugar con el mismo teléfono/WhatsApp. También clubes
-- SaaS con nombre parecido en la misma ciudad (para vincular en vez de
-- duplicar).
CREATE OR REPLACE FUNCTION public.platform_find_padel_venue_duplicates(
  p_name          text,
  p_department    text,
  p_municipality  text,
  p_address       text DEFAULT NULL,
  p_phone         text DEFAULT NULL,
  p_whatsapp      text DEFAULT NULL,
  p_exclude_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_name   text := public._padel_venue_name_key(p_name);
  v_muni   text := public._open_match_city_key(p_municipality);
  v_addr   text := NULLIF(public._padel_venue_name_key(p_address), '');
  v_phone  text := NULLIF(public._padel_venue_phone(p_phone), 'invalid');
  v_wa     text := NULLIF(public._padel_venue_phone(p_whatsapp), 'invalid');
  v_phones text[];
BEGIN
  PERFORM public._padel_venue_require_platform_admin();
  v_phones := array_remove(ARRAY[v_phone, v_wa], NULL);

  RETURN jsonb_build_object(
    'venues', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pv.id, 'name', pv.name, 'municipality', pv.municipality,
        'department', pv.department, 'address', pv.address, 'status', pv.status,
        'reason', CASE
          WHEN pv.municipality_key = v_muni AND v_name <> '' AND pv.name_key = v_name THEN 'same_name'
          WHEN pv.municipality_key = v_muni AND v_name <> ''
               AND (pv.name_key LIKE '%' || v_name || '%' OR v_name LIKE '%' || pv.name_key || '%') THEN 'similar_name'
          WHEN pv.municipality_key = v_muni AND v_addr IS NOT NULL
               AND public._padel_venue_name_key(pv.address) = v_addr THEN 'same_address'
          ELSE 'same_phone'
        END
      ) ORDER BY pv.name)
      FROM public.padel_venues AS pv
      WHERE (p_exclude_id IS NULL OR pv.id <> p_exclude_id)
        AND (
          (pv.municipality_key = v_muni AND v_name <> ''
            AND (pv.name_key LIKE '%' || v_name || '%' OR v_name LIKE '%' || pv.name_key || '%'))
          OR (pv.municipality_key = v_muni AND v_addr IS NOT NULL
            AND public._padel_venue_name_key(pv.address) = v_addr)
          OR (cardinality(v_phones) > 0 AND (pv.phone = ANY (v_phones) OR pv.whatsapp = ANY (v_phones)))
        )
    ), '[]'::jsonb),
    'clubs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'city', c.city,
        'linked_venue_id', (SELECT pv.id FROM public.padel_venues AS pv WHERE pv.club_id = c.id)
      ) ORDER BY c.name)
      FROM public.clubs AS c
      WHERE v_name <> ''
        AND (c.city IS NULL OR public._open_match_city_key(c.city) = v_muni)
        AND (public._padel_venue_name_key(c.name) LIKE '%' || v_name || '%'
             OR v_name LIKE '%' || public._padel_venue_name_key(c.name) || '%')
    ), '[]'::jsonb)
  );
END;
$$;

-- Crear (p_venue_id NULL) o editar. Nunca cambia estado ni vínculo: eso
-- tiene sus propias funciones. El id es estable — editar nunca lo cambia.
CREATE OR REPLACE FUNCTION public.platform_save_padel_venue(
  p_venue_id       uuid,
  p_name           text,
  p_department     text,
  p_municipality   text,
  p_address        text DEFAULT NULL,
  p_latitude       numeric DEFAULT NULL,
  p_longitude      numeric DEFAULT NULL,
  p_maps_url       text DEFAULT NULL,
  p_phone          text DEFAULT NULL,
  p_whatsapp       text DEFAULT NULL,
  p_source_label   text DEFAULT NULL,
  p_source_url     text DEFAULT NULL,
  p_verified_at    date DEFAULT NULL,
  p_internal_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid      uuid := public._padel_venue_require_platform_admin();
  v_name     text := public._padel_venue_clean(p_name);
  v_dept     text := public._padel_venue_clean(p_department);
  v_muni     text := public._padel_venue_clean(p_municipality);
  v_address  text := public._padel_venue_clean(p_address);
  v_maps     text := public._padel_venue_clean(p_maps_url);
  v_phone    text := public._padel_venue_phone(p_phone);
  v_wa       text := public._padel_venue_phone(p_whatsapp);
  v_source   text := public._padel_venue_clean(p_source_label);
  v_src_url  text := public._padel_venue_clean(p_source_url);
  v_notes    text := NULLIF(btrim(coalesce(p_internal_notes, '')), '');
  v_current  public.padel_venues;
  v_result   public.padel_venues;
BEGIN
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_dept IS NULL OR char_length(v_dept) < 2 OR char_length(v_dept) > 60 THEN
    RAISE EXCEPTION 'invalid_department' USING ERRCODE = '22023';
  END IF;
  IF v_muni IS NULL OR char_length(v_muni) < 2 OR char_length(v_muni) > 60 THEN
    RAISE EXCEPTION 'invalid_municipality' USING ERRCODE = '22023';
  END IF;
  IF v_address IS NOT NULL AND (char_length(v_address) < 3 OR char_length(v_address) > 200) THEN
    RAISE EXCEPTION 'invalid_address' USING ERRCODE = '22023';
  END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL)
     OR (p_latitude IS NOT NULL AND (p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180)) THEN
    RAISE EXCEPTION 'invalid_coordinates' USING ERRCODE = '22023';
  END IF;
  IF v_maps IS NOT NULL AND NOT public._padel_venue_maps_url_ok(v_maps) THEN
    RAISE EXCEPTION 'invalid_maps_url' USING ERRCODE = '22023';
  END IF;
  IF v_phone = 'invalid' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF v_wa = 'invalid' THEN
    RAISE EXCEPTION 'invalid_whatsapp' USING ERRCODE = '22023';
  END IF;
  IF v_source IS NOT NULL AND (char_length(v_source) < 3 OR char_length(v_source) > 200) THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
  END IF;
  IF v_src_url IS NOT NULL AND (char_length(v_src_url) > 500 OR v_src_url !~ '^https://[^[:space:]<>"''`]+$') THEN
    RAISE EXCEPTION 'invalid_source_url' USING ERRCODE = '22023';
  END IF;
  IF p_verified_at IS NOT NULL AND p_verified_at > (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'invalid_verified_at' USING ERRCODE = '22023';
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'invalid_notes' USING ERRCODE = '22023';
  END IF;

  -- Duplicado exacto (mismo nombre normalizado en el mismo municipio y
  -- departamento) → error estable en vez del 23505 crudo del índice.
  IF EXISTS (
    SELECT 1 FROM public.padel_venues AS pv
    WHERE pv.name_key = public._padel_venue_name_key(v_name)
      AND pv.municipality_key = public._open_match_city_key(v_muni)
      AND pv.department_key = public._open_match_city_key(v_dept)
      AND (p_venue_id IS NULL OR pv.id <> p_venue_id)
  ) THEN
    RAISE EXCEPTION 'duplicate_venue' USING ERRCODE = '23505';
  END IF;

  IF p_venue_id IS NULL THEN
    INSERT INTO public.padel_venues AS pv (
      name, name_key, department, department_key, municipality, municipality_key,
      address, latitude, longitude, maps_url, phone, whatsapp,
      source_label, source_url, verified_at, internal_notes, created_by, updated_by
    )
    VALUES (
      v_name, public._padel_venue_name_key(v_name),
      v_dept, public._open_match_city_key(v_dept),
      v_muni, public._open_match_city_key(v_muni),
      v_address, p_latitude, p_longitude, v_maps, v_phone, v_wa,
      v_source, v_src_url, p_verified_at, v_notes, v_uid, v_uid
    )
    RETURNING pv.* INTO v_result;
  ELSE
    SELECT pv.* INTO v_current FROM public.padel_venues AS pv WHERE pv.id = p_venue_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;
    -- Una ficha publicada debe seguir siendo publicable tras editarla.
    IF v_current.status = 'published' AND (v_address IS NULL OR v_source IS NULL OR p_verified_at IS NULL) THEN
      RAISE EXCEPTION 'not_publishable' USING ERRCODE = '23514';
    END IF;

    UPDATE public.padel_venues AS pv
    SET name             = v_name,
        name_key         = public._padel_venue_name_key(v_name),
        department       = v_dept,
        department_key   = public._open_match_city_key(v_dept),
        municipality     = v_muni,
        municipality_key = public._open_match_city_key(v_muni),
        address          = v_address,
        latitude         = p_latitude,
        longitude        = p_longitude,
        maps_url         = v_maps,
        phone            = v_phone,
        whatsapp         = v_wa,
        source_label     = v_source,
        source_url       = v_src_url,
        verified_at      = p_verified_at,
        internal_notes   = v_notes,
        updated_by       = v_uid,
        updated_at       = now()
    WHERE pv.id = p_venue_id
    RETURNING pv.* INTO v_result;
  END IF;

  RETURN public._padel_venue_admin_json(v_result);
END;
$$;

-- Publicar / despublicar / volver a borrador. Publicar exige ficha completa.
CREATE OR REPLACE FUNCTION public.platform_set_padel_venue_status(p_venue_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid    uuid := public._padel_venue_require_platform_admin();
  v_venue  public.padel_venues;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('draft', 'published', 'unpublished') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT pv.* INTO v_venue FROM public.padel_venues AS pv WHERE pv.id = p_venue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'published'
     AND (v_venue.address IS NULL OR v_venue.source_label IS NULL OR v_venue.verified_at IS NULL) THEN
    RAISE EXCEPTION 'not_publishable' USING ERRCODE = '23514';
  END IF;

  UPDATE public.padel_venues AS pv
  SET status       = p_status,
      published_at = CASE WHEN p_status = 'published' THEN COALESCE(pv.published_at, now()) ELSE pv.published_at END,
      updated_by   = v_uid,
      updated_at   = now()
  WHERE pv.id = p_venue_id
  RETURNING pv.* INTO v_venue;

  RETURN public._padel_venue_admin_json(v_venue);
END;
$$;

-- Vincular a un club SaaS existente (o desvincular con p_club_id NULL).
-- Solo una referencia: no crea ni modifica membresías, roles, suscripción
-- ni datos del club. El id del directorio y las referencias de partidos se
-- conservan.
CREATE OR REPLACE FUNCTION public.platform_link_padel_venue_club(p_venue_id uuid, p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid    uuid := public._padel_venue_require_platform_admin();
  v_venue  public.padel_venues;
BEGIN
  SELECT pv.* INTO v_venue FROM public.padel_venues AS pv WHERE pv.id = p_venue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_club_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.clubs AS c WHERE c.id = p_club_id) THEN
      RAISE EXCEPTION 'club_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.padel_venues AS pv
      WHERE pv.club_id = p_club_id AND pv.id <> p_venue_id
    ) THEN
      RAISE EXCEPTION 'club_already_linked' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.padel_venues AS pv
  SET club_id = p_club_id, updated_by = v_uid, updated_at = now()
  WHERE pv.id = p_venue_id
  RETURNING pv.* INTO v_venue;

  RETURN public._padel_venue_admin_json(v_venue);
END;
$$;

-- Conversión asistida: crea el club pendiente con Entrega de Club
-- (platform_create_pending_club, sin reimplementarlo) y en la misma
-- transacción lo vincula a la ficha, copiando solo los datos públicos
-- verificados (ciudad, departamento, dirección, coordenadas, WhatsApp).
-- No genera claim link, lead, OWNER definitivo ni suscripción: el handoff
-- sigue siendo el flujo de claim existente, iniciado por SUPERADMIN, y la
-- prueba comercial empieza solo en claim_club() — sin cambios.
CREATE OR REPLACE FUNCTION public.platform_convert_padel_venue_to_pending_club(
  p_venue_id   uuid,
  p_name       text,
  p_slug       text,
  p_visibility text DEFAULT 'private'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid       uuid := public._padel_venue_require_platform_admin();
  v_venue     public.padel_venues;
  v_club_id   uuid;
  v_club_slug text;
BEGIN
  SELECT pv.* INTO v_venue FROM public.padel_venues AS pv WHERE pv.id = p_venue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_venue.club_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_linked' USING ERRCODE = '23514';
  END IF;

  SELECT t.id, t.slug INTO v_club_id, v_club_slug
  FROM public.platform_create_pending_club(p_name, p_slug, p_visibility) AS t;

  UPDATE public.clubs AS c
  SET city      = COALESCE(c.city, v_venue.municipality),
      state     = COALESCE(c.state, v_venue.department),
      country   = COALESCE(c.country, 'Colombia'),
      address   = COALESCE(c.address, v_venue.address),
      latitude  = COALESCE(c.latitude, v_venue.latitude),
      longitude = COALESCE(c.longitude, v_venue.longitude),
      whatsapp  = COALESCE(c.whatsapp, v_venue.whatsapp)
  WHERE c.id = v_club_id;

  UPDATE public.padel_venues AS pv
  SET club_id = v_club_id, updated_by = v_uid, updated_at = now()
  WHERE pv.id = p_venue_id;

  RETURN jsonb_build_object('id', v_club_id, 'slug', v_club_slug);
END;
$$;

-- Borrado físico solo de un borrador sin referencias (error de captura).
-- Todo lo demás se despublica: nunca se pierde historial.
CREATE OR REPLACE FUNCTION public.platform_delete_padel_venue_draft(p_venue_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_venue public.padel_venues;
BEGIN
  PERFORM public._padel_venue_require_platform_admin();
  SELECT pv.* INTO v_venue FROM public.padel_venues AS pv WHERE pv.id = p_venue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_venue.status <> 'draft' OR v_venue.published_at IS NOT NULL OR v_venue.club_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.open_matches AS om WHERE om.venue_id = p_venue_id) THEN
    RAISE EXCEPTION 'venue_has_history' USING ERRCODE = '23514';
  END IF;
  DELETE FROM public.padel_venues AS pv WHERE pv.id = p_venue_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_padel_venues() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_get_padel_venue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_find_padel_venue_duplicates(text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_save_padel_venue(uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_padel_venue_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_link_padel_venue_club(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_convert_padel_venue_to_pending_club(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_delete_padel_venue_draft(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.platform_list_padel_venues() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_padel_venue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_find_padel_venue_duplicates(text, text, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_save_padel_venue(uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_padel_venue_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_link_padel_venue_club(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_convert_padel_venue_to_pending_club(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_padel_venue_draft(uuid) TO authenticated;


-- ─── 6. Partidos abiertos: lugar del directorio ─────────────────────────

-- Valida el establecimiento elegido para un partido. NULL = sin lugar del
-- directorio. Uno NUEVO (distinto del actual) debe estar publicado; el ya
-- guardado se conserva aunque luego se despublique (referencia histórica).
-- En ambos casos debe estar en la ciudad del partido.
CREATE OR REPLACE FUNCTION public._open_match_check_venue(
  p_venue_id   uuid,
  p_city_key   text,
  p_current_id uuid
)
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_venue public.padel_venues;
BEGIN
  IF p_venue_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT pv.* INTO v_venue FROM public.padel_venues AS pv WHERE pv.id = p_venue_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_venue.status <> 'published' AND p_venue_id IS DISTINCT FROM p_current_id THEN
    RAISE EXCEPTION 'venue_unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_venue.municipality_key <> p_city_key THEN
    RAISE EXCEPTION 'venue_city_mismatch' USING ERRCODE = '22023';
  END IF;
  RETURN v_venue.id;
END;
$$;

REVOKE ALL ON FUNCTION public._open_match_check_venue(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ¿Cambió el LUGAR EFECTIVO del partido? (establecimiento del directorio
-- o, si no hay, el texto libre normalizado). Reglas:
--   - sin lugar antes → nunca es cambio (definirlo por primera vez);
--   - establecimiento A → otro establecimiento, texto o nada → cambio;
--   - texto T → texto distinto o nada → cambio; mismo texto con otras
--     mayúsculas/tildes/espacios/puntuación → no es cambio;
--   - texto T → establecimiento cuyo nombre normalizado es T → no es
--     cambio (se formaliza el mismo lugar); cualquier otro → cambio.
CREATE OR REPLACE FUNCTION public._open_match_place_changed(
  p_old_venue_id uuid,
  p_old_name     text,
  p_new_venue_id uuid,
  p_new_name     text
)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_old_key text := public._padel_venue_name_key(p_old_name);
  v_new_key text;
BEGIN
  IF p_old_venue_id IS NULL AND v_old_key = '' THEN
    RETURN false;
  END IF;
  IF p_old_venue_id IS NOT NULL THEN
    RETURN p_new_venue_id IS DISTINCT FROM p_old_venue_id;
  END IF;
  IF p_new_venue_id IS NOT NULL THEN
    SELECT public._padel_venue_name_key(pv.name) INTO v_new_key
    FROM public.padel_venues AS pv WHERE pv.id = p_new_venue_id;
  ELSE
    v_new_key := public._padel_venue_name_key(p_new_name);
  END IF;
  RETURN COALESCE(v_new_key, '') <> v_old_key;
END;
$$;

REVOKE ALL ON FUNCTION public._open_match_place_changed(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- Representación del partido + lugar del directorio. Idéntica a
-- 20261116000001 salvo el campo 'venue': ficha pública si sigue publicada;
-- si fue despublicada, solo nombre y municipio (sin contacto ni mapa) para
-- que el historial del partido siga siendo legible.
CREATE OR REPLACE FUNCTION public._open_match_to_json(
  p_match                 public.open_matches,
  p_viewer                uuid,
  p_include_participants  boolean
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_taken       integer := public._open_match_taken(p_match.id, p_match.guest_count);
  v_starts_at   timestamptz := public._open_match_starts_at(p_match.match_date, p_match.start_time);
  v_phase       text;
  v_organizer   text;
  v_viewer_row  public.open_match_participants;
  v_venue       public.padel_venues;
  v_venue_json  jsonb;
  v_result      jsonb;
BEGIN
  v_phase := CASE
    WHEN p_match.status = 'cancelled' THEN 'cancelled'
    WHEN v_starts_at <= now()         THEN 'finished'
    WHEN v_taken >= p_match.max_players THEN 'full'
    ELSE 'open'
  END;

  SELECT public._open_match_display_name(p.full_name) INTO v_organizer
  FROM public.profiles AS p
  WHERE p.id = p_match.organizer_id;

  IF p_viewer IS NOT NULL THEN
    SELECT omp.* INTO v_viewer_row
    FROM public.open_match_participants AS omp
    WHERE omp.match_id = p_match.id AND omp.profile_id = p_viewer AND omp.is_active = true;
  END IF;

  IF p_match.venue_id IS NOT NULL THEN
    SELECT pv.* INTO v_venue FROM public.padel_venues AS pv WHERE pv.id = p_match.venue_id;
    IF FOUND THEN
      IF v_venue.status = 'published' THEN
        v_venue_json := public._padel_venue_public_json(v_venue) || jsonb_build_object('is_published', true);
      ELSE
        v_venue_json := jsonb_build_object(
          'id', v_venue.id, 'name', v_venue.name, 'municipality', v_venue.municipality,
          'department', v_venue.department, 'is_published', false
        );
      END IF;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'id',                  p_match.id,
    'city',                p_match.city,
    'match_date',          p_match.match_date,
    'start_time',          to_char(p_match.start_time, 'HH24:MI'),
    'level',               p_match.level,
    'max_players',         p_match.max_players,
    'guest_count',         p_match.guest_count,
    'taken',               LEAST(v_taken, p_match.max_players::integer),
    'spots_left',          GREATEST(p_match.max_players - v_taken, 0),
    'venue_name',          p_match.venue_name,
    'venue',               v_venue_json,
    'court_status',        p_match.court_status,
    'comment',             p_match.comment,
    'status',              p_match.status,
    'phase',               v_phase,
    'schedule_version',    p_match.schedule_version,
    'schedule_changed_at', p_match.schedule_changed_at,
    'organizer_name',      COALESCE(v_organizer, 'Jugador'),
    'created_at',          p_match.created_at,
    'updated_at',          p_match.updated_at,
    'viewer_is_organizer', (p_viewer IS NOT NULL AND p_viewer = p_match.organizer_id),
    'viewer_is_participant', (v_viewer_row.id IS NOT NULL),
    'viewer_needs_reconfirm', (
      v_viewer_row.id IS NOT NULL
      AND v_viewer_row.confirmed_schedule_version < p_match.schedule_version
    )
  );

  IF p_include_participants THEN
    v_result := v_result || jsonb_build_object(
      'participants',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'display_name',   public._open_match_display_name(p.full_name),
            'avatar_url',     CASE WHEN p_viewer IS NOT NULL THEN p.avatar_url ELSE NULL END,
            'is_organizer',   (omp.profile_id = p_match.organizer_id),
            'is_viewer',      (p_viewer IS NOT NULL AND omp.profile_id = p_viewer),
            'needs_reconfirm', (omp.confirmed_schedule_version < p_match.schedule_version)
          )
          ORDER BY (omp.profile_id = p_match.organizer_id) DESC, omp.joined_at ASC
        )
        FROM public.open_match_participants AS omp
        JOIN public.profiles AS p ON p.id = omp.profile_id
        WHERE omp.match_id = p_match.id AND omp.is_active = true
      ), '[]'::jsonb)
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public._open_match_to_json(public.open_matches, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- create gana p_venue_id y update gana p_venue_id + p_clear_venue, todos
-- al final y con DEFAULT. Se reemplazan (DROP + CREATE, en la misma
-- transacción de la migración) en vez de sobrecargarse: dos firmas con
-- defaults volverían ambigua la resolución por nombre de PostgREST. Las
-- firmas anteriores se nombran exactas (sin IF EXISTS ni CASCADE): si no
-- coincidieran con producción la migración falla entera en vez de dejar
-- dos versiones vivas. Ningún objeto SQL depende de ellas (solo se invocan
-- vía RPC). Un cliente anterior que no envía los parámetros nuevos sigue
-- funcionando: crear sin lugar y editar CONSERVANDO el establecimiento.
DROP FUNCTION public.create_open_match(text, date, time, text, integer, text, text, boolean);
DROP FUNCTION public.update_open_match(uuid, text, date, time, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.create_open_match(
  p_city            text,
  p_match_date      date,
  p_start_time      time,
  p_level           text,
  p_players_already integer DEFAULT 1,
  p_venue_name      text DEFAULT NULL,
  p_comment         text DEFAULT NULL,
  p_court_booked    boolean DEFAULT false,
  p_venue_id        uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid    uuid := public._open_match_require_player();
  v_city   text;
  v_venue  uuid;
  v_id     uuid;
BEGIN
  v_city := public._open_match_validate(p_city, p_match_date, p_start_time, p_level, p_venue_name, p_comment);
  v_venue := public._open_match_check_venue(p_venue_id, public._open_match_city_key(v_city), NULL);

  IF p_players_already IS NULL OR p_players_already < 1 OR p_players_already > 4 THEN
    RAISE EXCEPTION 'invalid_players_already' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*) FROM public.open_matches AS om
    WHERE om.organizer_id = v_uid
      AND om.status = 'active'
      AND public._open_match_starts_at(om.match_date, om.start_time) > now()
  ) >= 5 THEN
    RAISE EXCEPTION 'too_many_active_matches' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.open_matches AS om (
    organizer_id, city, city_key, match_date, start_time, level,
    guest_count, venue_id, venue_name, court_status, court_booked_at, comment
  )
  VALUES (
    v_uid, v_city, public._open_match_city_key(v_city), p_match_date, p_start_time, p_level,
    (p_players_already - 1)::smallint,
    v_venue,
    -- Con lugar del directorio, el texto libre sobra: una sola fuente.
    CASE WHEN v_venue IS NULL THEN NULLIF(btrim(coalesce(p_venue_name, '')), '') END,
    CASE WHEN COALESCE(p_court_booked, false) THEN 'booked' ELSE 'pending' END,
    CASE WHEN COALESCE(p_court_booked, false) THEN now() END,
    NULLIF(btrim(coalesce(p_comment, '')), '')
  )
  RETURNING om.id INTO v_id;

  INSERT INTO public.open_match_participants AS omp (match_id, profile_id, confirmed_schedule_version)
  VALUES (v_id, v_uid, 1);

  RETURN v_id;
END;
$$;

-- Editar. Igual que 20261116000001 más el lugar del directorio.
--
-- Contrato del establecimiento (omitir NUNCA lo borra):
--   - p_venue_id NULL y p_clear_venue false (o ambos omitidos, p. ej. un
--     cliente anterior) → se CONSERVA el establecimiento actual; el texto
--     libre se ignora mientras haya establecimiento.
--   - p_venue_id = X → selecciona X (publicado y en la ciudad del partido,
--     salvo que ya fuera el actual).
--   - p_clear_venue true (con p_venue_id NULL) → quita el establecimiento;
--     queda el texto libre de p_venue_name (o nada).
--   - ambos a la vez → invalid_venue.
-- Un cambio del LUGAR EFECTIVO (ver _open_match_place_changed) abre una
-- nueva versión de horario igual que ciudad/fecha/hora: los demás deben
-- reconfirmar, conservan su cupo y el organizador queda confirmado.
CREATE OR REPLACE FUNCTION public.update_open_match(
  p_match_id     uuid,
  p_city         text,
  p_match_date   date,
  p_start_time   time,
  p_level        text,
  p_venue_name   text DEFAULT NULL,
  p_comment      text DEFAULT NULL,
  p_court_booked boolean DEFAULT false,
  p_venue_id     uuid DEFAULT NULL,
  p_clear_venue  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid       uuid := public._open_match_require_player();
  v_match     public.open_matches;
  v_city      text;
  v_venue     uuid;
  v_name      text;
  v_changed   boolean;
  v_booked    boolean := COALESCE(p_court_booked, false);
BEGIN
  v_match := public._open_match_lock(p_match_id);

  IF v_match.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'not_organizer' USING ERRCODE = '42501';
  END IF;
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF public._open_match_starts_at(v_match.match_date, v_match.start_time) <= now() THEN
    RAISE EXCEPTION 'match_started' USING ERRCODE = 'P0001';
  END IF;

  v_city := public._open_match_validate(p_city, p_match_date, p_start_time, p_level, p_venue_name, p_comment);

  IF p_venue_id IS NOT NULL AND COALESCE(p_clear_venue, false) THEN
    RAISE EXCEPTION 'invalid_venue_selection' USING ERRCODE = '22023';
  END IF;
  -- Omitido = conservar el actual (revalidado contra la ciudad nueva).
  v_venue := public._open_match_check_venue(
    CASE WHEN COALESCE(p_clear_venue, false) THEN NULL ELSE COALESCE(p_venue_id, v_match.venue_id) END,
    public._open_match_city_key(v_city),
    v_match.venue_id
  );
  v_name := CASE WHEN v_venue IS NULL THEN NULLIF(btrim(coalesce(p_venue_name, '')), '') END;

  v_changed := public._open_match_city_key(v_city) <> v_match.city_key
            OR p_match_date <> v_match.match_date
            OR p_start_time <> v_match.start_time
            OR public._open_match_place_changed(v_match.venue_id, v_match.venue_name, v_venue, v_name);

  UPDATE public.open_matches AS om
  SET city                = v_city,
      city_key            = public._open_match_city_key(v_city),
      match_date          = p_match_date,
      start_time          = p_start_time,
      level               = p_level,
      venue_id            = v_venue,
      venue_name          = v_name,
      comment             = NULLIF(btrim(coalesce(p_comment, '')), ''),
      court_status        = CASE WHEN v_booked THEN 'booked' ELSE 'pending' END,
      court_booked_at     = CASE
                              WHEN v_booked AND om.court_status = 'booked' THEN om.court_booked_at
                              WHEN v_booked THEN now()
                              ELSE NULL
                            END,
      schedule_version    = CASE WHEN v_changed THEN om.schedule_version + 1 ELSE om.schedule_version END,
      schedule_changed_at = CASE WHEN v_changed THEN now() ELSE om.schedule_changed_at END,
      updated_at          = now()
  WHERE om.id = v_match.id;

  IF v_changed THEN
    UPDATE public.open_match_participants AS omp
    SET confirmed_schedule_version = v_match.schedule_version + 1
    WHERE omp.match_id = v_match.id AND omp.profile_id = v_uid;
  END IF;

  SELECT om.* INTO v_match FROM public.open_matches AS om WHERE om.id = p_match_id;
  RETURN public._open_match_to_json(v_match, v_uid, true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_open_match(text, date, time, text, integer, text, text, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_open_match(uuid, text, date, time, text, text, text, boolean, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_open_match(text, date, time, text, integer, text, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_open_match(uuid, text, date, time, text, text, text, boolean, uuid, boolean) TO authenticated;
