-- ============================================================
-- QA — Directorio de establecimientos (20261117000001_padel_venues_directory.sql)
-- ============================================================
-- Ejecuta la lógica SQL REAL contra una base DESECHABLE con todas las
-- migraciones aplicadas. Nunca contra producción: todo corre dentro de una
-- transacción que termina en ROLLBACK, pero requiere superusuario para
-- crear usuarios de prueba y simular auth.uid().
--
--   psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/test-padel-venues.sql
--
-- Las llamadas se hacen con SET LOCAL ROLE authenticated/anon para probar
-- también los GRANT; auth.uid() se simula vía request.jwt.claim.sub.
-- ============================================================

BEGIN;

CREATE FUNCTION pg_temp.as_user(p_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(p_id::text, ''), true);
$$;

CREATE FUNCTION pg_temp.eq(p_actual text, p_expected text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL: % — esperado %, obtenido %', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'ok  %', p_label;
END;
$$;

CREATE FUNCTION pg_temp.fails(p_sql text, p_expected text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(p_expected IN SQLERRM) > 0 THEN
      RAISE NOTICE 'ok  % (%)', p_label, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL: % — error inesperado: %', p_label, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: % — se esperaba error "%"', p_label, p_expected;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.as_user(uuid), pg_temp.eq(text, text, text), pg_temp.fails(text, text, text) TO anon, authenticated;

-- ─── Usuarios de prueba ─────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'pv-super@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'pv-player@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', 'pv-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'pv-admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d5', 'pv-p2@test.local');

INSERT INTO public.profiles (id, full_name, account_type, is_platform_admin) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'Super Admin', 'SUPERADMIN', true),
  ('00000000-0000-0000-0000-0000000000d2', 'Laura Gómez', 'PLAYER', false),
  ('00000000-0000-0000-0000-0000000000d3', 'Olga Dueña', 'OWNER', false),
  ('00000000-0000-0000-0000-0000000000d4', 'Andrés Admin', 'ADMIN', false),
  ('00000000-0000-0000-0000-0000000000d5', 'Pedro Pérez', NULL, false);

-- Club SaaS existente (para vincular).
INSERT INTO public.clubs (id, name, slug, visibility, is_active, city, state)
VALUES ('00000000-0000-0000-0000-00000000c1b1', 'Pádel Sogamoso Club', 'padel-sogamoso', 'public', true, 'Sogamoso', 'Boyacá');

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO anon, authenticated;

-- ─── Funciones reemplazadas: una sola firma, permisos correctos ────────
SELECT pg_temp.eq((SELECT count(*)::text FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_open_match'), '1', 'create_open_match sin sobrecargas');
SELECT pg_temp.eq((SELECT count(*)::text FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'update_open_match'), '1', 'update_open_match sin sobrecargas');
SELECT pg_temp.eq(pg_get_function_identity_arguments('public.update_open_match'::regproc), 'p_match_id uuid, p_city text, p_match_date date, p_start_time time without time zone, p_level text, p_venue_name text, p_comment text, p_court_booked boolean, p_venue_id uuid, p_clear_venue boolean', 'firma nueva de update_open_match');
SELECT pg_temp.eq(has_function_privilege('anon', 'public.create_open_match'::regproc, 'EXECUTE')::text, 'false', 'anon no ejecuta create_open_match');
SELECT pg_temp.eq(has_function_privilege('anon', 'public.update_open_match'::regproc, 'EXECUTE')::text, 'false', 'anon no ejecuta update_open_match');
SELECT pg_temp.eq(has_function_privilege('authenticated', 'public.update_open_match'::regproc, 'EXECUTE')::text, 'true', 'authenticated ejecuta update_open_match');
SELECT pg_temp.eq((SELECT bool_or(has_function_privilege(r, p.oid, 'EXECUTE'))::text FROM pg_proc AS p, unnest(ARRAY['anon', 'authenticated']) AS r
  WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE '\_padel\_venue\_%' OR p.proname IN ('_open_match_check_venue', '_open_match_place_changed'))), 'false', 'helpers internos sin EXECUTE para roles cliente');

-- ─── Permisos ───────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SELECT pg_temp.fails('SELECT * FROM public.padel_venues', 'permission denied', 'anon no lee la tabla directamente');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'X Pádel', 'Boyacá', 'Tunja')$q$, 'permission denied', 'anon no puede ejecutar platform_save');
SELECT pg_temp.fails($q$SELECT public.platform_list_padel_venues()$q$, 'permission denied', 'anon no puede listar admin');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.fails('SELECT * FROM public.padel_venues', 'permission denied', 'authenticated no lee la tabla directamente');
SELECT pg_temp.fails('INSERT INTO public.padel_venues (name, name_key, department, department_key, municipality, municipality_key) VALUES (''a'',''a'',''b'',''b'',''c'',''c'')', 'permission denied', 'authenticated no inserta directamente');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'X Pádel', 'Boyacá', 'Tunja')$q$, 'Not authorized', 'PLAYER no administra');
SELECT pg_temp.fails($q$SELECT public.platform_list_padel_venues()$q$, 'Not authorized', 'PLAYER no lista admin');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'X Pádel', 'Boyacá', 'Tunja')$q$, 'Not authorized', 'OWNER no administra el directorio global');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'X Pádel', 'Boyacá', 'Tunja')$q$, 'Not authorized', 'ADMIN no administra el directorio global');
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'X Pádel', 'Boyacá', 'Tunja')$q$, 'Not authorized', 'sin sesión no administra');

-- ─── Crear / validar (SUPERADMIN) ───────────────────────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');

INSERT INTO ids SELECT 'tunja', (public.platform_save_padel_venue(
  NULL, '  Pádel   Center Tunja ', 'Boyacá', 'Tunja', NULL, NULL, NULL, NULL,
  '+57 310 123 4567', '(608) 740 1234', NULL, NULL, NULL, NULL) ->> 'id')::uuid;

SELECT pg_temp.eq((public.platform_get_padel_venue((SELECT v FROM ids WHERE k = 'tunja')) ->> 'name'), 'Pádel Center Tunja', 'nombre normalizado (espacios)');
SELECT pg_temp.eq((public.platform_get_padel_venue((SELECT v FROM ids WHERE k = 'tunja')) ->> 'status'), 'draft', 'nace como borrador');
SELECT pg_temp.eq((public.platform_get_padel_venue((SELECT v FROM ids WHERE k = 'tunja')) ->> 'phone'), '573101234567', 'teléfono móvil normalizado');
SELECT pg_temp.eq((public.platform_get_padel_venue((SELECT v FROM ids WHERE k = 'tunja')) ->> 'whatsapp'), '576087401234', 'WhatsApp fijo 60x normalizado');

SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, NULL, '12345')$q$, 'invalid_phone', 'teléfono inválido');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, NULL, NULL, 'abc310')$q$, 'invalid_whatsapp', 'WhatsApp inválido');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, 'javascript:alert(1)')$q$, 'invalid_maps_url', 'mapa javascript: rechazado');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, 'http://maps.google.com/x')$q$, 'invalid_maps_url', 'mapa http rechazado');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, 'https://evil.example/maps')$q$, 'invalid_maps_url', 'mapa de dominio desconocido rechazado');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, 'https://maps.app.goo.gl/a"onmouseover=x')$q$, 'invalid_maps_url', 'mapa con comillas rechazado');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, NULL, NULL, NULL, 'Instagram', 'javascript:alert(1)')$q$, 'invalid_source_url', 'fuente javascript: rechazada');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, 5.5, NULL)$q$, 'invalid_coordinates', 'coordenadas incompletas');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Otro', 'Boyacá', 'Tunja', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, current_date + 5)$q$, 'invalid_verified_at', 'verificación futura rechazada');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'X', 'Boyacá', 'Tunja')$q$, 'invalid_name', 'nombre demasiado corto');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Algo', '', 'Tunja')$q$, 'invalid_department', 'departamento obligatorio');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'Algo', 'Boyacá', ' ')$q$, 'invalid_municipality', 'municipio obligatorio');

-- Duplicado exacto (variación de tildes/mayúsculas/puntuación).
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue(NULL, 'PADEL-CENTER tunja', 'boyaca', 'TUNJA')$q$, 'duplicate_venue', 'duplicado exacto bloqueado');
-- Mismo nombre en otro municipio sí se permite.
SELECT pg_temp.eq((public.platform_save_padel_venue(NULL, 'Pádel Center Tunja', 'Boyacá', 'Paipa') ->> 'municipality'), 'Paipa', 'mismo nombre en otro municipio permitido');

-- Detección de posibles duplicados.
SELECT pg_temp.eq(
  (SELECT string_agg(e ->> 'reason', ',' ORDER BY e ->> 'reason') FROM jsonb_array_elements(
    public.platform_find_padel_venue_duplicates('Padel Center', 'Boyacá', 'Tunja') -> 'venues') AS e),
  'similar_name', 'similar por nombre en el mismo municipio');
SELECT pg_temp.eq(
  (SELECT count(*)::text FROM jsonb_array_elements(
    public.platform_find_padel_venue_duplicates('Nombre distinto', 'Cundinamarca', 'Chía', NULL, '3101234567') -> 'venues')),
  '1', 'duplicado por teléfono en cualquier municipio');
SELECT pg_temp.eq(
  (SELECT count(*)::text FROM jsonb_array_elements(
    public.platform_find_padel_venue_duplicates('Pádel Center Tunja', 'Boyacá', 'Tunja', NULL, NULL, NULL, (SELECT v FROM ids WHERE k = 'tunja')) -> 'venues')),
  '0', 'excluye la ficha en edición');
SELECT pg_temp.eq(
  (SELECT e ->> 'slug' FROM jsonb_array_elements(
    public.platform_find_padel_venue_duplicates('Pádel Sogamoso', 'Boyacá', 'Sogamoso') -> 'clubs') AS e),
  'padel-sogamoso', 'detecta club SaaS parecido en la misma ciudad');

-- ─── Publicación ────────────────────────────────────────────────────────
SELECT pg_temp.fails($q$SELECT public.platform_set_padel_venue_status((SELECT v FROM ids WHERE k = 'tunja'), 'published')$q$, 'not_publishable', 'sin dirección/fuente/verificación no publica');
SELECT pg_temp.fails($q$SELECT public.platform_set_padel_venue_status((SELECT v FROM ids WHERE k = 'tunja'), 'visible')$q$, 'invalid_status', 'estado inválido');

SELECT pg_temp.eq((public.platform_save_padel_venue(
  (SELECT v FROM ids WHERE k = 'tunja'), 'Pádel Center Tunja', 'Boyacá', 'Tunja', 'Cra 10 # 20-30',
  5.535, -73.367, 'https://maps.app.goo.gl/abc123', '3101234567', '6087401234',
  'Instagram oficial del establecimiento', 'https://instagram.com/padelcenter', current_date - 1, 'Nota interna') ->> 'id'),
  (SELECT v FROM ids WHERE k = 'tunja')::text, 'editar conserva el id estable');
SELECT pg_temp.eq((public.platform_set_padel_venue_status((SELECT v FROM ids WHERE k = 'tunja'), 'published') ->> 'status'), 'published', 'publica con ficha completa');
SELECT pg_temp.fails($q$SELECT public.platform_save_padel_venue((SELECT v FROM ids WHERE k = 'tunja'), 'Pádel Center Tunja', 'Boyacá', 'Tunja')$q$, 'not_publishable', 'una ficha publicada no puede quedar incompleta');

-- Una segunda ficha publicada en Duitama y un borrador en Tunja.
INSERT INTO ids SELECT 'duitama', (public.platform_save_padel_venue(
  NULL, 'Duitama Pádel', 'Boyacá', 'Duitama', 'Calle 15 # 3-40', NULL, NULL, NULL, NULL, NULL,
  'Llamada al establecimiento', NULL, current_date) ->> 'id')::uuid;
SELECT public.platform_set_padel_venue_status((SELECT v FROM ids WHERE k = 'duitama'), 'published');
INSERT INTO ids SELECT 'borrador', (public.platform_save_padel_venue(NULL, 'Borrador Tunja', 'Boyacá', 'Tunja') ->> 'id')::uuid;
-- Bogotá para probar que el directorio no está limitado a Boyacá.
INSERT INTO ids SELECT 'bogota', (public.platform_save_padel_venue(
  NULL, 'Pádel Norte', 'Bogotá D.C.', 'Bogotá', 'Av 19 # 120-10', NULL, NULL, NULL, NULL, NULL,
  'Sitio web oficial', 'https://example.com', current_date) ->> 'id')::uuid;
SELECT public.platform_set_padel_venue_status((SELECT v FROM ids WHERE k = 'bogota'), 'published');
RESET ROLE;

-- ─── Lectura pública ────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.eq(jsonb_array_length(public.list_padel_venues())::text, '3', 'anon ve solo las 3 publicadas');
SELECT pg_temp.eq(jsonb_array_length(public.list_padel_venues(NULL, 'boyaca'))::text, '2', 'filtro departamento (sin tilde)');
SELECT pg_temp.eq(jsonb_array_length(public.list_padel_venues(NULL, 'Boyacá', 'TUNJA'))::text, '1', 'filtro municipio');
SELECT pg_temp.eq((public.list_padel_venues('center') -> 0 ->> 'name'), 'Pádel Center Tunja', 'búsqueda por nombre');
SELECT pg_temp.eq(jsonb_array_length(public.list_padel_venues('borrador'))::text, '0', 'borrador nunca es público');
SELECT pg_temp.eq((public.list_padel_venues('center') -> 0 ? 'source_label')::text, 'false', 'público sin procedencia');
SELECT pg_temp.eq((public.list_padel_venues('center') -> 0 ? 'internal_notes')::text, 'false', 'público sin notas internas');
SELECT pg_temp.eq((public.list_padel_venues('center') -> 0 ? 'status')::text, 'false', 'público sin estado interno');
SELECT pg_temp.eq((public.list_padel_venues('center') -> 0 ? 'logo_url')::text, 'false', 'sin logo ni fotos de terceros');
SELECT pg_temp.eq((public.list_padel_venues('center') -> 0 ->> 'whatsapp'), '576087401234', 'contacto comercial público');
RESET ROLE;

-- ─── Partidos abiertos con establecimiento ──────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');

-- Sin establecimiento (firma anterior, 8 argumentos) sigue funcionando.
INSERT INTO ids SELECT 'm_none', public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '19:00', '6a', 1, NULL, NULL, false);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_none')) -> 'venue')::text, 'null', 'partido sin establecimiento');
INSERT INTO ids SELECT 'm_txt0', public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '18:00', '6a', 1, 'Por definir', NULL, false);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_txt0')) ->> 'venue_name'), 'Por definir', 'lugar textual se conserva');

-- Con establecimiento.
INSERT INTO ids SELECT 'm_venue', public.create_open_match('tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '20:00', '6a', 2, 'texto ignorado', NULL, true, (SELECT v FROM ids WHERE k = 'tunja'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) -> 'venue' ->> 'name'), 'Pádel Center Tunja', 'detalle muestra el establecimiento');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) -> 'venue' ->> 'address'), 'Cra 10 # 20-30', 'detalle muestra la dirección');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) -> 'venue' ->> 'phone'), '573101234567', 'detalle muestra el contacto');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) ->> 'venue_name'), NULL, 'con establecimiento no se duplica el texto libre');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) ->> 'court_status'), 'booked', 'cancha reservada externamente se conserva');

SELECT pg_temp.fails($q$SELECT public.create_open_match('Duitama', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '20:00', '6a', 1, NULL, NULL, false, (SELECT v FROM ids WHERE k = 'tunja'))$q$, 'venue_city_mismatch', 'establecimiento de otra ciudad rechazado');
SELECT pg_temp.fails($q$SELECT public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '20:00', '6a', 1, NULL, NULL, false, (SELECT v FROM ids WHERE k = 'borrador'))$q$, 'venue_unavailable', 'borrador no seleccionable');
SELECT pg_temp.fails($q$SELECT public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '20:00', '6a', 1, NULL, NULL, false, gen_random_uuid())$q$, 'venue_unavailable', 'establecimiento inexistente rechazado');

-- Definir el lugar después (antes no había) NO abre nueva versión de horario.
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_none'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '19:00', '6a', NULL, NULL, false, (SELECT v FROM ids WHERE k = 'tunja'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_none')) ->> 'schedule_version'), '1', 'definir lugar por primera vez no exige reconfirmar');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_none')) -> 'venue' ->> 'id'), (SELECT v FROM ids WHERE k = 'tunja')::text, 'lugar definido después');

-- Otro jugador se une, luego el organizador cambia de establecimiento (a Duitama, con ciudad).
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
SELECT public.join_open_match((SELECT v FROM ids WHERE k = 'm_none'));
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_none'), 'Duitama', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '19:00', '6a', NULL, NULL, false, (SELECT v FROM ids WHERE k = 'duitama'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_none')) ->> 'schedule_version'), '2', 'cambiar de establecimiento exige reconfirmar');
-- Mismo lugar y horario: sin nueva versión.
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_none'), 'Duitama', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '19:00', '5a', NULL, 'nuevo comentario', false, (SELECT v FROM ids WHERE k = 'duitama'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_none')) ->> 'schedule_version'), '2', 'editar nivel/comentario no exige reconfirmar');

-- ─── Contrato de edición: omitir NUNCA quita el establecimiento ─────────
INSERT INTO ids SELECT 'm_keep', public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 5), '20:00', '6a', 1, NULL, NULL, true, (SELECT v FROM ids WHERE k = 'tunja'));
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
SELECT public.join_open_match((SELECT v FROM ids WHERE k = 'm_keep'));
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
-- Cliente anterior: firma de 8 argumentos posicionales, sin p_venue_id.
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_keep'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 5), '20:00', '5a', NULL, 'solo cambio nivel', true);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) -> 'venue' ->> 'id'), (SELECT v FROM ids WHERE k = 'tunja')::text, 'omitir p_venue_id conserva el establecimiento');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) ->> 'schedule_version'), '1', 'conservar el lugar no exige reconfirmar');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) ->> 'court_status'), 'booked', 'editar conserva la cancha reservada externamente');
-- Texto libre enviado por un cliente anterior no reemplaza el establecimiento.
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_keep'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 5), '20:00', '5a', 'Otro sitio', NULL, true);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) -> 'venue' ->> 'id'), (SELECT v FROM ids WHERE k = 'tunja')::text, 'texto libre no borra el establecimiento');
-- Omitirlo y cambiar de ciudad falla explícitamente (nunca pérdida silenciosa).
SELECT pg_temp.fails($q$SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_keep'), 'Duitama', ((now() AT TIME ZONE 'America/Bogota')::date + 5), '20:00', '5a', NULL, NULL, true)$q$, 'venue_city_mismatch', 'cambiar ciudad conservando un lugar de otra ciudad se rechaza');
SELECT pg_temp.fails($q$SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_keep'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 5), '20:00', '5a', NULL, NULL, true, (SELECT v FROM ids WHERE k = 'tunja'), true)$q$, 'invalid_venue_selection', 'elegir y quitar a la vez se rechaza');
-- Quitar explícitamente: lugar efectivo cambia → reconfirmación.
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_keep'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 5), '20:00', '5a', NULL, NULL, true, NULL, true);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) -> 'venue')::text, 'null', 'p_clear_venue quita el establecimiento');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) ->> 'schedule_version'), '2', 'quitar el establecimiento exige reconfirmar');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) ->> 'viewer_needs_reconfirm'), 'false', 'el organizador queda confirmado en la versión nueva');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) ->> 'taken'), '2', 'los participantes conservan su cupo');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) ->> 'viewer_needs_reconfirm'), 'true', 'el participante debe reconfirmar');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
-- Volver a elegirlo cuando antes no había lugar: definir por primera vez.
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_keep'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 5), '20:00', '5a', NULL, NULL, true, (SELECT v FROM ids WHERE k = 'tunja'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_keep')) ->> 'schedule_version'), '2', 'elegir lugar cuando no había ninguno no exige reconfirmar');

-- ─── Reconfirmación por lugar efectivo (texto libre) ────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
INSERT INTO ids SELECT 'm_text', public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '20:00', '6a', 1, 'Cancha Norte', NULL, false);
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_text'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '20:00', '6a', '  cancha   NORTE ');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_text')) ->> 'schedule_version'), '1', 'mismo texto con otro formato no exige reconfirmar');
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_text'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '20:00', '6a', 'Cancha Sur');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_text')) ->> 'schedule_version'), '2', 'texto a otro texto exige reconfirmar');
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_text'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '20:00', '6a', NULL);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_text')) ->> 'schedule_version'), '3', 'quitar el lugar escrito exige reconfirmar');
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_text'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '20:00', '6a', 'Cancha Sur');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_text')) ->> 'schedule_version'), '3', 'escribir lugar cuando no había ninguno no exige reconfirmar');
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_text'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '20:00', '6a', NULL, NULL, false, (SELECT v FROM ids WHERE k = 'tunja'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_text')) ->> 'schedule_version'), '4', 'texto a un establecimiento distinto exige reconfirmar');

INSERT INTO ids SELECT 'm_same', public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '21:00', '6a', 1, 'padel center tunja', NULL, false);
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_same'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '21:00', '6a', NULL, NULL, false, (SELECT v FROM ids WHERE k = 'tunja'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_same')) ->> 'schedule_version'), '1', 'formalizar el mismo lugar escrito como establecimiento no exige reconfirmar');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_same')) ->> 'venue_name'), NULL, 'con establecimiento el texto libre queda vacío');
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_same'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 6), '21:00', '6a', 'Pádel Center Tunja', NULL, false, NULL, true);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_same')) ->> 'schedule_version'), '2', 'establecimiento a texto libre exige reconfirmar (se quitó el establecimiento)');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');

-- Solo el organizador edita el lugar.
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
SELECT pg_temp.fails($q$SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_none'), 'Duitama', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '19:00', '5a', NULL, NULL, false, NULL)$q$, 'not_organizer', 'participante no cambia el lugar');
RESET ROLE;

-- ─── Despublicar preserva el historial ──────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
SELECT public.platform_set_padel_venue_status((SELECT v FROM ids WHERE k = 'tunja'), 'unpublished');
SELECT pg_temp.fails($q$SELECT public.platform_delete_padel_venue_draft((SELECT v FROM ids WHERE k = 'tunja'))$q$, 'venue_has_history', 'no se borra una ficha con historial');
SELECT pg_temp.eq(public.platform_delete_padel_venue_draft((SELECT v FROM ids WHERE k = 'borrador'))::text, 'true', 'borrador sin referencias se puede borrar');
SELECT pg_temp.eq(((public.platform_get_padel_venue((SELECT v FROM ids WHERE k = 'tunja'))) ->> 'match_count'), '3', 'admin ve cuántos partidos la referencian (m_venue, m_keep, m_text)');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) -> 'venue' ->> 'name'), 'Pádel Center Tunja', 'partido conserva el nombre tras despublicar');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) -> 'venue' ->> 'is_published'), 'false', 'partido marca el lugar como no publicado');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) -> 'venue' ? 'phone')::text, 'false', 'sin contacto de una ficha despublicada');
-- Conservar el mismo lugar despublicado al editar está permitido…
SELECT public.update_open_match((SELECT v FROM ids WHERE k = 'm_venue'), 'Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 3), '20:00', '5a', NULL, NULL, true, (SELECT v FROM ids WHERE k = 'tunja'));
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_venue')) -> 'venue' ->> 'id'), (SELECT v FROM ids WHERE k = 'tunja')::text, 'editar conserva un lugar ya despublicado');
-- …pero elegirlo de nuevo en otro partido no.
SELECT pg_temp.fails($q$SELECT public.create_open_match('Tunja', ((now() AT TIME ZONE 'America/Bogota')::date + 4), '20:00', '6a', 1, NULL, NULL, false, (SELECT v FROM ids WHERE k = 'tunja'))$q$, 'venue_unavailable', 'despublicado no seleccionable en partidos nuevos');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.eq(jsonb_array_length(public.list_padel_venues(NULL, 'Boyacá'))::text, '1', 'despublicado sale del directorio público');
RESET ROLE;

-- ─── Vinculación y conversión al SaaS ───────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
SELECT pg_temp.fails($q$SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'duitama'), '00000000-0000-0000-0000-00000000c1b1')$q$, 'Not authorized', 'PLAYER no vincula');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
SELECT pg_temp.fails($q$SELECT public.platform_convert_padel_venue_to_pending_club((SELECT v FROM ids WHERE k = 'duitama'), 'X', 'x-club')$q$, 'Not authorized', 'OWNER no convierte');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
SELECT pg_temp.eq((public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'bogota'), '00000000-0000-0000-0000-00000000c1b1') -> 'club' ->> 'slug'), 'padel-sogamoso', 'vincula a club existente');
SELECT pg_temp.fails($q$SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'duitama'), '00000000-0000-0000-0000-00000000c1b1')$q$, 'club_already_linked', 'un club no se vincula a dos fichas');
SELECT pg_temp.fails($q$SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'duitama'), gen_random_uuid())$q$, 'club_not_found', 'club inexistente');
SELECT pg_temp.eq((public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'bogota'), NULL) ->> 'club_id'), NULL, 'desvincular');

-- Conversión: club pendiente creado por Entrega de Club, datos copiados, mismo id de ficha.
INSERT INTO ids SELECT 'club_duitama', (public.platform_convert_padel_venue_to_pending_club((SELECT v FROM ids WHERE k = 'duitama'), 'Duitama Pádel', 'duitama-padel') ->> 'id')::uuid;
RESET ROLE;
SELECT pg_temp.eq((SELECT c.city || '|' || c.state || '|' || c.address || '|' || c.pending_claim FROM public.clubs AS c WHERE c.id = (SELECT v FROM ids WHERE k = 'club_duitama')), 'Duitama|Boyacá|Calle 15 # 3-40|true', 'club pendiente con datos públicos de la ficha');
SELECT pg_temp.eq((SELECT pv.club_id::text FROM public.padel_venues AS pv WHERE pv.id = (SELECT v FROM ids WHERE k = 'duitama')), (SELECT v FROM ids WHERE k = 'club_duitama')::text, 'ficha vinculada al nuevo club (id estable)');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.club_members AS cm WHERE cm.club_id = (SELECT v FROM ids WHERE k = 'club_duitama')), '1', 'solo el OWNER temporal de Entrega de Club (sin propietarios inventados)');
SELECT pg_temp.eq((SELECT om.venue_id::text FROM public.open_matches AS om WHERE om.id = (SELECT v FROM ids WHERE k = 'm_none')), (SELECT v FROM ids WHERE k = 'duitama')::text, 'partido conserva la referencia tras la conversión');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
SELECT pg_temp.fails($q$SELECT public.platform_convert_padel_venue_to_pending_club((SELECT v FROM ids WHERE k = 'duitama'), 'Duitama 2', 'duitama-2')$q$, 'already_linked', 'no se convierte dos veces');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM ids WHERE k = 'm_none')) -> 'venue' -> 'club' ->> 'slug'), 'duitama-padel', 'detalle del partido enlaza al club SaaS');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.eq((public.list_padel_venues('duitama') -> 0 -> 'club' ->> 'slug'), 'duitama-padel', 'directorio público identifica el club SaaS');
RESET ROLE;

-- ─── Visibilidad del club vinculado (= regla real de /clubs) ────────────
-- /clubs y la página pública /[slug] muestran todo club con is_active =
-- true AND archived_at IS NULL (política clubs_select_active, también para
-- anon), sea público, privado o pendiente de entrega. La ficha solo expone
-- id/nombre/slug/visibilidad de ese club — lo mismo que esa política ya
-- permite leer —, y nada si el club no cumple esa regla.
INSERT INTO public.clubs (id, name, slug, visibility, is_active, archived_at, pending_claim) VALUES
  ('00000000-0000-0000-0000-00000000c1b2', 'Privado Club', 'privado-club', 'private', true, NULL, false),
  ('00000000-0000-0000-0000-00000000c1b3', 'Inactivo Club', 'inactivo-club', 'public', false, NULL, false),
  ('00000000-0000-0000-0000-00000000c1b4', 'Archivado Club', 'archivado-club', 'public', true, now(), false),
  ('00000000-0000-0000-0000-00000000c1b5', 'Pendiente Club', 'pendiente-club', 'private', true, NULL, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
INSERT INTO ids SELECT 'vis_' || x.k, (public.platform_save_padel_venue(NULL, 'Vis ' || x.k, 'Boyacá', 'Paipa', 'Calle ' || x.k, NULL, NULL, NULL, NULL, NULL, 'Fuente', NULL, current_date) ->> 'id')::uuid
FROM (VALUES ('pub'), ('priv'), ('inact'), ('arch'), ('pend')) AS x(k);
SELECT public.platform_set_padel_venue_status(i.v, 'published') FROM ids AS i WHERE i.k LIKE 'vis\_%';
SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'vis_pub'), '00000000-0000-0000-0000-00000000c1b1');
SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'vis_priv'), '00000000-0000-0000-0000-00000000c1b2');
SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'vis_inact'), '00000000-0000-0000-0000-00000000c1b3');
SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'vis_arch'), '00000000-0000-0000-0000-00000000c1b4');
SELECT public.platform_link_padel_venue_club((SELECT v FROM ids WHERE k = 'vis_pend'), '00000000-0000-0000-0000-00000000c1b5');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.eq((public.list_padel_venues('vis pub') -> 0 -> 'club' ->> 'visibility'), 'public', 'club público vinculado: visible');
SELECT pg_temp.eq((public.list_padel_venues('vis priv') -> 0 -> 'club' ->> 'visibility'), 'private', 'club privado: mismo dato que /clubs ya lista (sin funciones privadas)');
SELECT pg_temp.eq((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.list_padel_venues('vis priv') -> 0 -> 'club') AS k), 'id,name,slug,visibility', 'del club solo se exponen id, nombre, slug y visibilidad');
SELECT pg_temp.eq((public.list_padel_venues('vis inact') -> 0 -> 'club')::text, 'null', 'club inactivo: sin referencia al club');
SELECT pg_temp.eq((public.list_padel_venues('vis arch') -> 0 -> 'club')::text, 'null', 'club archivado: sin referencia al club');
SELECT pg_temp.eq((public.list_padel_venues('vis pend') -> 0 -> 'club' ->> 'slug'), 'pendiente-club', 'club pendiente de entrega: igual que /clubs (activo, no archivado)');
SELECT pg_temp.eq((public.list_padel_venues('vis inact') -> 0 ->> 'name'), 'Vis inact', 'la ficha sigue visible como lugar físico');
RESET ROLE;

ROLLBACK;
