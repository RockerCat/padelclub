-- ============================================================
-- Encuentra tu partido — partidos abiertos organizados por jugadores
-- Mi Pádel Club
-- ============================================================
-- Un módulo independiente de clubes: un partido abierto NO pertenece a un
-- club, NO necesita una membresía, NO reserva una cancha del SaaS y NO toca
-- `reservations`, `club_members`, `profiles.account_type` ni ninguna otra
-- tabla existente. Funciona con cero clubes registrados en la ciudad.
--
-- Diseño:
--   - Dos tablas nuevas (open_matches, open_match_participants), RLS
--     habilitado SIN políticas — mismo patrón cerrado que commercial_leads/
--     club_claim_links: todo acceso pasa por funciones SECURITY DEFINER.
--     Así la autorización vive en un solo lugar y los datos personales
--     (teléfono, correo, nombre completo) nunca salen hacia vistas públicas.
--   - Dos estados distintos, nunca mezclados:
--       * conformación de jugadores: DERIVADA (participantes activos +
--         invitados declarados vs. 4 cupos) — nunca persistida, nunca
--         desincronizable.
--       * confirmación de cancha: court_status 'pending' | 'booked'
--         (reservada externamente, declarado por el organizador). La
--         plataforma nunca afirma disponibilidad de una cancha que no
--         administra.
--   - status persistido solo distingue 'active' | 'cancelled'; "completo"
--     y "finalizado" se derivan (cupos / fecha+hora en America/Bogota).
--   - Cupos: todo cambio que ocupa o libera cupos (unirse, invitados)
--     bloquea la fila del partido (FOR UPDATE) antes de contar y escribir,
--     así dos jugadores nunca toman el mismo último cupo.
--   - Cambio de horario: schedule_version se incrementa cuando cambia
--     ciudad/fecha/hora; cada participante guarda la versión que aceptó.
--     Un participante con una versión vieja debe reconfirmar — su
--     aceptación anterior nunca se presenta como confirmación del nuevo
--     horario. El cupo se conserva (no se bloquea la operación real).
--   - Ningún RETURNS TABLE: todas las lecturas devuelven jsonb, evitando de
--     raíz la ambigüedad de columnas de salida (42702) documentada en
--     CLAUDE.md → Tournament Module Principles. Igual, toda tabla va con
--     alias explícito.
--   - Sin notificaciones en v1: insertar en `notifications` dispara push
--     móvil (20261111000001), y push está fuera de alcance; los cambios se
--     muestran en el detalle del partido y en "Mis partidos".
-- ============================================================


-- ─── 1. Tablas ──────────────────────────────────────────────────────────

CREATE TABLE public.open_matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  city                text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 60),
  -- Clave de búsqueda normalizada (minúsculas, sin tildes, espacios
  -- colapsados) — calculada por _open_match_city_key, nunca por el cliente.
  city_key            text NOT NULL,
  match_date          date NOT NULL,
  start_time          time NOT NULL,
  level               text NOT NULL CHECK (level IN ('iniciacion', '7a', '6a', '5a', '4a', '3a', '2a', '1a', 'cualquiera')),
  max_players         smallint NOT NULL DEFAULT 4 CHECK (max_players = 4),
  -- Acompañantes del organizador aún sin cuenta: ocupan cupos sin crear
  -- perfiles ficticios ni guardar ningún dato personal.
  guest_count         smallint NOT NULL DEFAULT 0 CHECK (guest_count BETWEEN 0 AND 3),
  venue_name          text CHECK (venue_name IS NULL OR char_length(venue_name) BETWEEN 1 AND 120),
  court_status        text NOT NULL DEFAULT 'pending' CHECK (court_status IN ('pending', 'booked')),
  court_booked_at     timestamptz,
  comment             text CHECK (comment IS NULL OR char_length(comment) <= 280),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  schedule_version    integer NOT NULL DEFAULT 1 CHECK (schedule_version >= 1),
  schedule_changed_at timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX open_matches_discovery_idx
  ON public.open_matches (match_date, start_time)
  WHERE status = 'active';

CREATE INDEX open_matches_city_idx
  ON public.open_matches (city_key, match_date)
  WHERE status = 'active';

CREATE INDEX open_matches_organizer_idx
  ON public.open_matches (organizer_id);

CREATE TABLE public.open_match_participants (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                    uuid NOT NULL REFERENCES public.open_matches(id) ON DELETE CASCADE,
  profile_id                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active                   boolean NOT NULL DEFAULT true,
  confirmed_schedule_version  integer NOT NULL CHECK (confirmed_schedule_version >= 1),
  joined_at                   timestamptz NOT NULL DEFAULT now(),
  left_at                     timestamptz,
  -- Una sola fila por jugador y partido: salir la desactiva, volver a
  -- unirse la reactiva. Imposible duplicar un participante.
  CONSTRAINT open_match_participants_unique UNIQUE (match_id, profile_id)
);

CREATE INDEX open_match_participants_profile_idx
  ON public.open_match_participants (profile_id)
  WHERE is_active = true;

ALTER TABLE public.open_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_match_participants ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito. Además se retiran los privilegios de tabla
-- por defecto para que ni siquiera un futuro cambio de RLS los exponga.
REVOKE ALL ON public.open_matches FROM anon, authenticated;
REVOKE ALL ON public.open_match_participants FROM anon, authenticated;


-- ─── 2. Helpers internos (sin GRANT a ningún rol cliente) ───────────────

-- "  Bogotá  D.C. " → "bogota d.c." — translate() en vez de unaccent para
-- no depender del schema donde viva la extensión.
CREATE OR REPLACE FUNCTION public._open_match_city_key(p_city text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT translate(
    lower(btrim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g'))),
    'áàäâãéèëêíìïîóòöôõúùüûñç',
    'aaaaaeeeeiiiiooooouuuunc'
  );
$$;

-- "Carlos Andrés Martínez" → "Carlos M." — nunca el nombre completo en
-- vistas de partidos (públicas o no).
CREATE OR REPLACE FUNCTION public._open_match_display_name(p_full_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  WITH n AS (
    SELECT btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')) AS v
  )
  SELECT CASE
    WHEN n.v = '' THEN 'Jugador'
    WHEN position(' ' IN n.v) = 0 THEN n.v
    ELSE split_part(n.v, ' ', 1) || ' ' || upper(left(regexp_replace(n.v, '^.* ', ''), 1)) || '.'
  END
  FROM n;
$$;

CREATE OR REPLACE FUNCTION public._open_match_starts_at(p_date date, p_time time)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT (p_date + p_time) AT TIME ZONE 'America/Bogota';
$$;

CREATE OR REPLACE FUNCTION public._open_match_today_bogota()
RETURNS date
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Bogota')::date;
$$;

-- Cupos ocupados = participantes activos + invitados declarados.
CREATE OR REPLACE FUNCTION public._open_match_taken(p_match_id uuid, p_guest_count smallint)
RETURNS integer
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT p_guest_count + (
    SELECT count(*)::integer
    FROM public.open_match_participants AS omp
    WHERE omp.match_id = p_match_id AND omp.is_active = true
  );
$$;

-- Llamador autenticado apto para partidos abiertos. Cualquier cuenta
-- autenticada puede jugar (no se exige club, membresía ni account_type, y
-- no se asigna ninguno); solo SUPERADMIN queda fuera, igual que en todo
-- flujo operativo.
CREATE OR REPLACE FUNCTION public._open_match_require_player()
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = v_uid) THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = v_uid AND (p.is_platform_admin = true OR p.account_type = 'SUPERADMIN')
  ) THEN
    RAISE EXCEPTION 'platform_admin_not_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

-- Bloquea y devuelve el partido. Toda mutación pasa por aquí primero.
CREATE OR REPLACE FUNCTION public._open_match_lock(p_match_id uuid)
RETURNS public.open_matches
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_match public.open_matches;
BEGIN
  SELECT om.* INTO v_match
  FROM public.open_matches AS om
  WHERE om.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_match;
END;
$$;

-- Valida los campos editables comunes a crear/editar. Devuelve la ciudad
-- ya normalizada para mostrar (espacios colapsados).
CREATE OR REPLACE FUNCTION public._open_match_validate(
  p_city        text,
  p_match_date  date,
  p_start_time  time,
  p_level       text,
  p_venue_name  text,
  p_comment     text
)
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_city text := btrim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g'));
BEGIN
  IF char_length(v_city) < 2 OR char_length(v_city) > 60 THEN
    RAISE EXCEPTION 'invalid_city' USING ERRCODE = '22023';
  END IF;
  IF p_match_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'invalid_datetime' USING ERRCODE = '22023';
  END IF;
  IF public._open_match_starts_at(p_match_date, p_start_time) <= now() THEN
    RAISE EXCEPTION 'datetime_in_past' USING ERRCODE = '22023';
  END IF;
  IF p_match_date > public._open_match_today_bogota() + 60 THEN
    RAISE EXCEPTION 'datetime_too_far' USING ERRCODE = '22023';
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('iniciacion', '7a', '6a', '5a', '4a', '3a', '2a', '1a', 'cualquiera') THEN
    RAISE EXCEPTION 'invalid_level' USING ERRCODE = '22023';
  END IF;
  IF p_venue_name IS NOT NULL AND char_length(btrim(p_venue_name)) > 120 THEN
    RAISE EXCEPTION 'invalid_venue' USING ERRCODE = '22023';
  END IF;
  IF p_comment IS NOT NULL AND char_length(btrim(p_comment)) > 280 THEN
    RAISE EXCEPTION 'invalid_comment' USING ERRCODE = '22023';
  END IF;
  RETURN v_city;
END;
$$;

-- Representación pública de un partido. Nunca incluye teléfono, correo,
-- nombre completo ni ids de perfil de terceros: solo nombre corto y
-- avatar (este último solo para visitantes autenticados).
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

REVOKE ALL ON FUNCTION public._open_match_city_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_display_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_starts_at(date, time) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_today_bogota() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_taken(uuid, smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_require_player() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_lock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_validate(text, date, time, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_match_to_json(public.open_matches, uuid, boolean) FROM PUBLIC, anon, authenticated;


-- ─── 3. Lecturas públicas (anon + authenticated) ────────────────────────

-- Descubrimiento: partidos activos y futuros (hasta 60 días), priorizando
-- los que tienen cupo y luego los más próximos.
--   p_city:      prefijo de ciudad (normalizado); NULL = todas.
--   p_date:      día exacto; NULL = desde hoy.
--   p_level:     nivel exacto; los partidos 'cualquiera' siempre coinciden.
--   p_min_spots: cupos libres mínimos (0 = incluye completos).
CREATE OR REPLACE FUNCTION public.list_open_matches(
  p_city      text DEFAULT NULL,
  p_date      date DEFAULT NULL,
  p_level     text DEFAULT NULL,
  p_min_spots integer DEFAULT 1,
  p_limit     integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_city_key  text := NULLIF(public._open_match_city_key(p_city), '');
  v_min_spots integer := LEAST(GREATEST(COALESCE(p_min_spots, 1), 0), 3);
  v_limit     integer := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100);
  v_viewer    uuid := auth.uid();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(x.j ORDER BY x.has_spots DESC, x.starts_at ASC)
    FROM (
      SELECT
        public._open_match_to_json(om, v_viewer, false) AS j,
        (om.max_players - public._open_match_taken(om.id, om.guest_count)) > 0 AS has_spots,
        public._open_match_starts_at(om.match_date, om.start_time) AS starts_at
      FROM public.open_matches AS om
      WHERE om.status = 'active'
        AND om.match_date >= public._open_match_today_bogota()
        AND om.match_date <= public._open_match_today_bogota() + 60
        AND public._open_match_starts_at(om.match_date, om.start_time) > now()
        AND (v_city_key IS NULL OR om.city_key LIKE v_city_key || '%')
        AND (p_date IS NULL OR om.match_date = p_date)
        AND (NULLIF(p_level, '') IS NULL OR om.level = p_level OR om.level = 'cualquiera')
        AND (om.max_players - public._open_match_taken(om.id, om.guest_count)) >= v_min_spots
      ORDER BY 2 DESC, 3 ASC
      LIMIT v_limit
    ) AS x
  ), '[]'::jsonb);
END;
$$;

-- Ciudades con partidos activos futuros — sugerencias para el filtro.
CREATE OR REPLACE FUNCTION public.list_open_match_cities()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('city', c.city, 'count', c.n) ORDER BY c.n DESC, c.city), '[]'::jsonb)
  FROM (
    SELECT min(om.city) AS city, count(*)::integer AS n
    FROM public.open_matches AS om
    WHERE om.status = 'active'
      AND public._open_match_starts_at(om.match_date, om.start_time) > now()
    GROUP BY om.city_key
    ORDER BY count(*) DESC
    LIMIT 30
  ) AS c;
$$;

-- Detalle (enlace compartible). Devuelve NULL si no existe. Partidos
-- cancelados/finalizados también se devuelven para que un enlace viejo
-- explique su estado en vez de un 404 sin contexto.
CREATE OR REPLACE FUNCTION public.get_open_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_match public.open_matches;
BEGIN
  SELECT om.* INTO v_match FROM public.open_matches AS om WHERE om.id = p_match_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public._open_match_to_json(v_match, auth.uid(), true);
END;
$$;

REVOKE ALL ON FUNCTION public.list_open_matches(text, date, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_open_match_cities() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_open_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_matches(text, date, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_open_match_cities() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_match(uuid) TO anon, authenticated;


-- ─── 4. Lectura personal (authenticated) ────────────────────────────────

-- "Mis partidos": los que organizo o en los que participo activamente,
-- próximos primero (más cercano arriba) y luego anteriores/cancelados.
CREATE OR REPLACE FUNCTION public.list_my_open_matches()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(x.j ORDER BY x.upcoming DESC,
                     CASE WHEN x.upcoming THEN x.starts_at END ASC,
                     CASE WHEN NOT x.upcoming THEN x.starts_at END DESC)
    FROM (
      SELECT
        public._open_match_to_json(om, v_uid, false) AS j,
        (om.status = 'active' AND public._open_match_starts_at(om.match_date, om.start_time) > now()) AS upcoming,
        public._open_match_starts_at(om.match_date, om.start_time) AS starts_at
      FROM public.open_matches AS om
      WHERE om.organizer_id = v_uid
         OR EXISTS (
           SELECT 1 FROM public.open_match_participants AS omp
           WHERE omp.match_id = om.id AND omp.profile_id = v_uid AND omp.is_active = true
         )
      ORDER BY 3 DESC
      LIMIT 100
    ) AS x
  ), '[]'::jsonb);
END;
$$;

-- FROM anon explícito: los privilegios por defecto de Supabase otorgan
-- EXECUTE directamente a anon (no vía PUBLIC), así que revocar solo PUBLIC
-- lo dejaría ejecutable sin sesión.
REVOKE ALL ON FUNCTION public.list_my_open_matches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_open_matches() TO authenticated;


-- ─── 5. Mutaciones (authenticated) ──────────────────────────────────────

-- Crear. p_players_already = jugadores que el organizador ya tiene,
-- contándose a sí mismo (1-4): los que no son él quedan como invitados
-- declarados (guest_count), liberables después.
CREATE OR REPLACE FUNCTION public.create_open_match(
  p_city            text,
  p_match_date      date,
  p_start_time      time,
  p_level           text,
  p_players_already integer DEFAULT 1,
  p_venue_name      text DEFAULT NULL,
  p_comment         text DEFAULT NULL,
  p_court_booked    boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid   uuid := public._open_match_require_player();
  v_city  text;
  v_id    uuid;
BEGIN
  v_city := public._open_match_validate(p_city, p_match_date, p_start_time, p_level, p_venue_name, p_comment);

  IF p_players_already IS NULL OR p_players_already < 1 OR p_players_already > 4 THEN
    RAISE EXCEPTION 'invalid_players_already' USING ERRCODE = '22023';
  END IF;

  -- Freno simple contra spam: máximo 5 partidos activos y futuros por
  -- organizador.
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
    guest_count, venue_name, court_status, court_booked_at, comment
  )
  VALUES (
    v_uid, v_city, public._open_match_city_key(v_city), p_match_date, p_start_time, p_level,
    (p_players_already - 1)::smallint,
    NULLIF(btrim(coalesce(p_venue_name, '')), ''),
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

-- Unirse. Idempotente para quien ya participa (doble clic = no-op).
CREATE OR REPLACE FUNCTION public.join_open_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid   uuid := public._open_match_require_player();
  v_match public.open_matches;
BEGIN
  v_match := public._open_match_lock(p_match_id);

  IF EXISTS (
    SELECT 1 FROM public.open_match_participants AS omp
    WHERE omp.match_id = v_match.id AND omp.profile_id = v_uid AND omp.is_active = true
  ) THEN
    RETURN public._open_match_to_json(v_match, v_uid, true);
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF public._open_match_starts_at(v_match.match_date, v_match.start_time) <= now() THEN
    RAISE EXCEPTION 'match_started' USING ERRCODE = 'P0001';
  END IF;
  -- Conteo bajo el bloqueo de la fila del partido: dos jugadores que
  -- intentan tomar el último cupo a la vez se serializan aquí.
  IF public._open_match_taken(v_match.id, v_match.guest_count) >= v_match.max_players THEN
    RAISE EXCEPTION 'match_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.open_match_participants AS omp (match_id, profile_id, confirmed_schedule_version)
  VALUES (v_match.id, v_uid, v_match.schedule_version)
  ON CONFLICT ON CONSTRAINT open_match_participants_unique DO UPDATE
    SET is_active = true,
        left_at = NULL,
        joined_at = now(),
        confirmed_schedule_version = EXCLUDED.confirmed_schedule_version;

  UPDATE public.open_matches AS om SET updated_at = now() WHERE om.id = v_match.id;

  SELECT om.* INTO v_match FROM public.open_matches AS om WHERE om.id = p_match_id;
  RETURN public._open_match_to_json(v_match, v_uid, true);
END;
$$;

-- Salir (solo el propio participante; el organizador cancela en su lugar).
CREATE OR REPLACE FUNCTION public.leave_open_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid   uuid := public._open_match_require_player();
  v_match public.open_matches;
BEGIN
  v_match := public._open_match_lock(p_match_id);

  IF v_match.organizer_id = v_uid THEN
    RAISE EXCEPTION 'organizer_cannot_leave' USING ERRCODE = 'P0001';
  END IF;
  IF public._open_match_starts_at(v_match.match_date, v_match.start_time) <= now()
     AND v_match.status = 'active' THEN
    RAISE EXCEPTION 'match_started' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.open_match_participants AS omp
  SET is_active = false, left_at = now()
  WHERE omp.match_id = v_match.id AND omp.profile_id = v_uid AND omp.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.open_matches AS om SET updated_at = now() WHERE om.id = v_match.id;

  SELECT om.* INTO v_match FROM public.open_matches AS om WHERE om.id = p_match_id;
  RETURN public._open_match_to_json(v_match, v_uid, true);
END;
$$;

-- Cancelar (solo el organizador). Idempotente sobre un partido ya
-- cancelado. Nunca borra: participantes e historial quedan intactos.
CREATE OR REPLACE FUNCTION public.cancel_open_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid   uuid := public._open_match_require_player();
  v_match public.open_matches;
BEGIN
  v_match := public._open_match_lock(p_match_id);

  IF v_match.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'not_organizer' USING ERRCODE = '42501';
  END IF;

  IF v_match.status = 'active' THEN
    IF public._open_match_starts_at(v_match.match_date, v_match.start_time) <= now() THEN
      RAISE EXCEPTION 'match_started' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.open_matches AS om
    SET status = 'cancelled', cancelled_at = now(), updated_at = now()
    WHERE om.id = v_match.id;
  END IF;

  SELECT om.* INTO v_match FROM public.open_matches AS om WHERE om.id = p_match_id;
  RETURN public._open_match_to_json(v_match, v_uid, true);
END;
$$;

-- Editar (solo el organizador): ciudad/fecha/hora/nivel/lugar/cancha/
-- comentario. Si cambia ciudad, fecha u hora se abre una nueva versión de
-- horario: los demás participantes deben reconfirmar (conservan su cupo).
CREATE OR REPLACE FUNCTION public.update_open_match(
  p_match_id     uuid,
  p_city         text,
  p_match_date   date,
  p_start_time   time,
  p_level        text,
  p_venue_name   text DEFAULT NULL,
  p_comment      text DEFAULT NULL,
  p_court_booked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid       uuid := public._open_match_require_player();
  v_match     public.open_matches;
  v_city      text;
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

  v_changed := public._open_match_city_key(v_city) <> v_match.city_key
            OR p_match_date <> v_match.match_date
            OR p_start_time <> v_match.start_time;

  UPDATE public.open_matches AS om
  SET city                = v_city,
      city_key            = public._open_match_city_key(v_city),
      match_date          = p_match_date,
      start_time          = p_start_time,
      level               = p_level,
      venue_name          = NULLIF(btrim(coalesce(p_venue_name, '')), ''),
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
    -- El organizador propone el nuevo horario: queda confirmado para él.
    UPDATE public.open_match_participants AS omp
    SET confirmed_schedule_version = v_match.schedule_version + 1
    WHERE omp.match_id = v_match.id AND omp.profile_id = v_uid;
  END IF;

  SELECT om.* INTO v_match FROM public.open_matches AS om WHERE om.id = p_match_id;
  RETURN public._open_match_to_json(v_match, v_uid, true);
END;
$$;

-- Invitados declarados del organizador (0-3). Bajar libera cupos; subir
-- solo si caben, bajo el mismo bloqueo que unirse.
CREATE OR REPLACE FUNCTION public.set_open_match_guests(p_match_id uuid, p_guest_count integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid    uuid := public._open_match_require_player();
  v_match  public.open_matches;
  v_active integer;
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
  IF p_guest_count IS NULL OR p_guest_count < 0 OR p_guest_count > 3 THEN
    RAISE EXCEPTION 'invalid_guest_count' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_active
  FROM public.open_match_participants AS omp
  WHERE omp.match_id = v_match.id AND omp.is_active = true;

  IF v_active + p_guest_count > v_match.max_players THEN
    RAISE EXCEPTION 'match_full' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.open_matches AS om
  SET guest_count = p_guest_count::smallint, updated_at = now()
  WHERE om.id = v_match.id;

  SELECT om.* INTO v_match FROM public.open_matches AS om WHERE om.id = p_match_id;
  RETURN public._open_match_to_json(v_match, v_uid, true);
END;
$$;

-- Reconfirmar asistencia al horario vigente (tras un cambio de horario).
CREATE OR REPLACE FUNCTION public.confirm_open_match_attendance(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid   uuid := public._open_match_require_player();
  v_match public.open_matches;
BEGIN
  v_match := public._open_match_lock(p_match_id);

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_cancelled' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.open_match_participants AS omp
  SET confirmed_schedule_version = v_match.schedule_version
  WHERE omp.match_id = v_match.id AND omp.profile_id = v_uid AND omp.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = 'P0001';
  END IF;

  RETURN public._open_match_to_json(v_match, v_uid, true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_open_match(text, date, time, text, integer, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_open_match(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_open_match(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_open_match(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_open_match(uuid, text, date, time, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_open_match_guests(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_open_match_attendance(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_open_match(text, date, time, text, integer, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_open_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_open_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_open_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_open_match(uuid, text, date, time, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_open_match_guests(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_open_match_attendance(uuid) TO authenticated;
