-- ============================================================
-- QA — Encuentra tu partido (20261116000001_open_matches.sql)
-- ============================================================
-- Ejecuta la lógica SQL REAL contra una base DESECHABLE con todas las
-- migraciones aplicadas. Nunca contra producción: todo corre dentro de una
-- transacción que termina en ROLLBACK, pero requiere superusuario para
-- crear usuarios de prueba y simular auth.uid().
--
--   psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/test-open-matches.sql
--
-- auth.uid() se simula vía request.jwt.claim.sub; las llamadas se hacen
-- con SET LOCAL ROLE authenticated/anon para probar también los GRANT.
-- La concurrencia real del último cupo (dos conexiones) se prueba aparte
-- en el harness de QA; aquí se prueba la regla bajo bloqueo.
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

-- Ejecuta p_sql y exige que falle con un mensaje que contenga p_expected.
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
  ('00000000-0000-0000-0000-0000000000a1', 'om-org@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'om-p2@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'om-p3@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'om-p4@test.local'),
  ('00000000-0000-0000-0000-0000000000a5', 'om-p5@test.local'),
  ('00000000-0000-0000-0000-0000000000a6', 'om-admin@test.local');

INSERT INTO public.profiles (id, full_name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Carlos Andrés Martínez'),
  ('00000000-0000-0000-0000-0000000000a2', 'Laura Gómez'),
  ('00000000-0000-0000-0000-0000000000a3', 'Pedro'),
  ('00000000-0000-0000-0000-0000000000a4', 'Ana María Ruiz'),
  ('00000000-0000-0000-0000-0000000000a5', 'Juan Pérez'),
  ('00000000-0000-0000-0000-0000000000a6', 'Plataforma Admin')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

UPDATE public.profiles SET phone = '+573001112233' WHERE id = '00000000-0000-0000-0000-0000000000a2';
UPDATE public.profiles SET is_platform_admin = true WHERE id = '00000000-0000-0000-0000-0000000000a6';

-- Fecha futura fija relativa a "hoy" en Bogotá.
CREATE TEMP TABLE t_ctx (k text PRIMARY KEY, v text);
GRANT ALL ON t_ctx TO anon, authenticated;
INSERT INTO t_ctx VALUES ('d', ((now() AT TIME ZONE 'America/Bogota')::date + 3)::text);

-- Reservas existentes: se cuentan antes y después para probar que el
-- módulo nunca las toca.
INSERT INTO t_ctx SELECT 'reservations_before', count(*)::text FROM public.reservations;

SET LOCAL ROLE authenticated;

-- ─── 1. Creación ────────────────────────────────────────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

INSERT INTO t_ctx SELECT 'm1', public.create_open_match(
  '  Bogotá  ', (SELECT v FROM t_ctx WHERE k = 'd')::date, '19:00', '6a', 2, 'Club Norte', 'Partido amistoso', false
)::text;

SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'city'), 'Bogotá', 'ciudad normalizada (espacios)');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'taken'), '2', 'organizador + 1 invitado = 2 cupos ocupados');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'spots_left'), '2', 'quedan 2 cupos');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'phase'), 'open', 'fase abierta');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'court_status'), 'pending', 'cancha pendiente por defecto');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'organizer_name'), 'Carlos M.', 'nombre corto del organizador');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'viewer_is_organizer'), 'true', 'viewer organizador');

SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', ((now() AT TIME ZONE 'America/Bogota')::date - 1), '10:00', '6a', 1)$$, 'datetime_in_past', 'fecha pasada rechazada');
SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', ((now() AT TIME ZONE 'America/Bogota')::date + 90), '10:00', '6a', 1)$$, 'datetime_too_far', 'más de 60 días rechazado');
SELECT pg_temp.fails($$SELECT public.create_open_match('B', ((now() AT TIME ZONE 'America/Bogota')::date + 2), '10:00', '6a', 1)$$, 'invalid_city', 'ciudad inválida');
SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', ((now() AT TIME ZONE 'America/Bogota')::date + 2), '10:00', 'pro', 1)$$, 'invalid_level', 'nivel inválido');
SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', ((now() AT TIME ZONE 'America/Bogota')::date + 2), '10:00', '6a', 5)$$, 'invalid_players_already', 'más de 4 jugadores rechazado');
SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', ((now() AT TIME ZONE 'America/Bogota')::date + 2), '10:00', '6a', 0)$$, 'invalid_players_already', '0 jugadores rechazado');

-- SUPERADMIN fuera.
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', ((now() AT TIME ZONE 'America/Bogota')::date + 2), '10:00', '6a', 1)$$, 'platform_admin_not_allowed', 'SUPERADMIN no crea partidos');
SELECT pg_temp.fails($$SELECT public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'platform_admin_not_allowed', 'SUPERADMIN no se une');

-- Sin sesión (authenticated sin sub).
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', ((now() AT TIME ZONE 'America/Bogota')::date + 2), '10:00', '6a', 1)$$, 'auth_required', 'crear exige sesión');

-- ─── 2. Inscripción, duplicados, último cupo ────────────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
SELECT pg_temp.eq((public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'taken'), '3', 'p2 se une → 3');
SELECT pg_temp.eq((public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'taken'), '3', 'p2 doble clic → sin duplicado');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
SELECT pg_temp.eq((public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'phase'), 'full', 'p3 toma el último cupo → completo');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
SELECT pg_temp.fails($$SELECT public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'match_full', 'p4 rechazado: sin cupo');
SELECT pg_temp.fails($$SELECT public.leave_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'not_participant', 'p4 no puede salir de un partido ajeno');

-- ─── 3. Privacidad del detalle ──────────────────────────────────────────
-- (joined_at es igual dentro de una sola transacción: se compara el
-- conjunto ordenado, y aparte que el organizador vaya primero.)
SELECT pg_temp.eq(
  (SELECT string_agg(e ->> 'display_name', ',' ORDER BY e ->> 'display_name')
   FROM jsonb_array_elements(public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) -> 'participants') e),
  'Carlos M.,Laura G.,Pedro', 'participantes con nombre corto');
SELECT pg_temp.eq(
  (public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) -> 'participants' -> 0 ->> 'is_organizer'),
  'true', 'el organizador va primero');
SELECT pg_temp.eq(
  (public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)::text LIKE '%3001112233%')::text,
  'false', 'el teléfono nunca aparece en el detalle');
SELECT pg_temp.eq(
  (public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)::text LIKE '%@test.local%')::text,
  'false', 'el correo nunca aparece en el detalle');
SELECT pg_temp.eq(
  (public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)::text LIKE '%00000000-0000-0000-0000-0000000000a2%')::text,
  'false', 'ids de perfil de terceros nunca aparecen');

-- ─── 4. Salida y liberación ─────────────────────────────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
SELECT pg_temp.eq((public.leave_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'spots_left'), '1', 'p3 sale → se libera 1 cupo');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
SELECT pg_temp.eq((public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'phase'), 'full', 'p4 toma el cupo liberado');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT pg_temp.fails($$SELECT public.leave_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'organizer_cannot_leave', 'el organizador no abandona (cancela)');

-- ─── 5. Invitados ───────────────────────────────────────────────────────
SELECT pg_temp.fails($$SELECT public.set_open_match_guests((SELECT v FROM t_ctx WHERE k='m1')::uuid, 2)$$, 'match_full', 'no caben más invitados');
SELECT pg_temp.eq((public.set_open_match_guests((SELECT v FROM t_ctx WHERE k='m1')::uuid, 0) ->> 'spots_left'), '1', 'liberar invitado → 1 cupo');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
SELECT pg_temp.fails($$SELECT public.set_open_match_guests((SELECT v FROM t_ctx WHERE k='m1')::uuid, 1)$$, 'not_organizer', 'un participante no gestiona invitados');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT pg_temp.eq((public.set_open_match_guests((SELECT v FROM t_ctx WHERE k='m1')::uuid, 1) ->> 'phase'), 'full', 'volver a ocupar con invitado');

-- ─── 6. Cambio de horario y reconfirmación ──────────────────────────────
SELECT pg_temp.eq((public.update_open_match(
  (SELECT v FROM t_ctx WHERE k='m1')::uuid, 'Bogotá', (SELECT v FROM t_ctx WHERE k='d')::date, '19:00', '5a', 'Club Norte', 'Nivel ajustado', false
) ->> 'schedule_version'), '1', 'cambiar solo nivel no abre nueva versión');

SELECT pg_temp.eq((public.update_open_match(
  (SELECT v FROM t_ctx WHERE k='m1')::uuid, 'Bogotá', (SELECT v FROM t_ctx WHERE k='d')::date, '20:30', '5a', 'Club Norte', NULL, true
) ->> 'schedule_version'), '2', 'cambiar hora abre versión 2');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'court_status'), 'booked', 'cancha reservada externamente');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'viewer_needs_reconfirm'), 'false', 'el organizador queda confirmado');
SELECT pg_temp.eq(
  (SELECT count(*)::text FROM jsonb_array_elements(public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) -> 'participants') e
   WHERE (e ->> 'needs_reconfirm')::boolean),
  '2', 'los otros 2 participantes deben reconfirmar');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'viewer_needs_reconfirm'), 'true', 'p2 ve que debe reconfirmar');
SELECT pg_temp.eq((public.confirm_open_match_attendance((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'viewer_needs_reconfirm'), 'false', 'p2 reconfirma');
SELECT pg_temp.fails($$SELECT public.update_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid, 'Cali', ((now() AT TIME ZONE 'America/Bogota')::date + 4), '10:00', '6a')$$, 'not_organizer', 'un participante no edita el partido');
SELECT pg_temp.fails($$SELECT public.cancel_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'not_organizer', 'un participante no cancela');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
SELECT pg_temp.fails($$SELECT public.confirm_open_match_attendance((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'not_participant', 'un tercero no confirma asistencia');

-- ─── 7. Descubrimiento y filtros ────────────────────────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
INSERT INTO t_ctx SELECT 'm2', public.create_open_match(
  'Medellín', (SELECT v FROM t_ctx WHERE k='d')::date + 1, '08:00', 'cualquiera', 1
)::text;

SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_open_matches('bogota', NULL, NULL, 0)) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m1')), '1', 'filtro ciudad sin tilde/minúsculas');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_open_matches('bogota', NULL, NULL, 1)) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m1')), '0', 'completo excluido con cupos ≥ 1');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_open_matches('Medel', NULL, '4a', 3)) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m2')), '1', 'prefijo de ciudad + nivel "cualquiera" coincide con 4a + 3 cupos');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_open_matches(NULL, (SELECT v FROM t_ctx WHERE k='d')::date, NULL, 0)) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m2')), '0', 'filtro de fecha exacta excluye otro día');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_open_matches('Cali', NULL, NULL, 0))), '0', 'ciudad sin partidos → vacío');

-- Prioridad: con cupo antes que completos.
SELECT pg_temp.eq((public.list_open_matches(NULL, NULL, NULL, 0) -> 0 ->> 'phase'), 'open', 'partidos con cupo primero');

-- Mis partidos.
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_my_open_matches()) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m1')), '1', 'mis partidos incluye donde participo');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_my_open_matches()) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m2')), '0', 'mis partidos excluye ajenos');

-- ─── 8. Partido iniciado ────────────────────────────────────────────────
RESET ROLE;
UPDATE public.open_matches SET match_date = (now() AT TIME ZONE 'America/Bogota')::date - 1
WHERE id = (SELECT v FROM t_ctx WHERE k='m2')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
SELECT pg_temp.fails($$SELECT public.join_open_match((SELECT v FROM t_ctx WHERE k='m2')::uuid)$$, 'match_started', 'no se une a un partido ya iniciado');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m2')::uuid) ->> 'phase'), 'finished', 'fase finalizado');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_open_matches(NULL, NULL, NULL, 0)) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m2')), '0', 'descubrimiento oculta partidos pasados');

-- ─── 9. Cancelación ─────────────────────────────────────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT pg_temp.eq((public.cancel_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'phase'), 'cancelled', 'organizador cancela');
SELECT pg_temp.eq((public.cancel_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'phase'), 'cancelled', 'cancelar dos veces es idempotente');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
SELECT pg_temp.fails($$SELECT public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'match_cancelled', 'no se une a un partido cancelado');
SELECT pg_temp.eq((SELECT count(*)::text FROM jsonb_array_elements(public.list_open_matches(NULL, NULL, NULL, 0)) e
  WHERE e ->> 'id' = (SELECT v FROM t_ctx WHERE k='m1')), '0', 'descubrimiento oculta cancelados');

-- ─── 10. Anon: lectura pública sí, escritura y tablas no ────────────────
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'phase'), 'cancelled', 'anon lee el detalle por enlace');
SELECT pg_temp.eq(
  (SELECT count(*)::text FROM jsonb_array_elements(public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) -> 'participants') e
   WHERE e ->> 'avatar_url' IS NOT NULL), '0', 'anon nunca recibe avatares');
SELECT pg_temp.eq((public.get_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid) ->> 'viewer_is_participant'), 'false', 'anon no es participante');
SELECT pg_temp.eq(jsonb_typeof(public.list_open_matches()), 'array', 'anon lista partidos');
SELECT pg_temp.eq(jsonb_typeof(public.list_open_match_cities()), 'array', 'anon lista ciudades');
SELECT pg_temp.eq((public.get_open_match('00000000-0000-0000-0000-00000000dead'))::text, NULL, 'partido inexistente → NULL');
SELECT pg_temp.fails($$SELECT public.join_open_match((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'permission denied', 'anon no puede unirse');
SELECT pg_temp.fails($$SELECT public.create_open_match('Bogotá', current_date + 2, '10:00', '6a', 1)$$, 'permission denied', 'anon no puede crear');
SELECT pg_temp.fails($$SELECT public.list_my_open_matches()$$, 'permission denied', 'anon no tiene "mis partidos"');
SELECT pg_temp.fails($$SELECT * FROM public.open_matches$$, 'permission denied', 'anon no lee la tabla directamente');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.fails($$SELECT * FROM public.open_matches$$, 'permission denied', 'authenticated no lee la tabla directamente');
SELECT pg_temp.fails($$SELECT * FROM public.open_match_participants$$, 'permission denied', 'authenticated no lee participantes directamente');
SELECT pg_temp.fails($$UPDATE public.open_matches SET guest_count = 0 WHERE id = (SELECT v FROM t_ctx WHERE k='m1')::uuid$$, 'permission denied', 'authenticated no escribe la tabla directamente');
SELECT pg_temp.fails($$SELECT public._open_match_lock((SELECT v FROM t_ctx WHERE k='m1')::uuid)$$, 'permission denied', 'helpers internos sin GRANT');

-- ─── 11. Integridad de reservas ─────────────────────────────────────────
RESET ROLE;
SELECT pg_temp.eq((SELECT count(*)::text FROM public.reservations), (SELECT v FROM t_ctx WHERE k='reservations_before'), 'ninguna reserva creada ni borrada');

DO $$ BEGIN RAISE NOTICE 'Todas las aserciones de partidos abiertos pasaron.'; END $$;

ROLLBACK;
