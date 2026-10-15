-- ============================================================
-- QA — Lanzamiento comercial 2026/2027
-- (20261115000011_launch_trial_months_public_offer.sql +
--  20261115000012_launch_offer_settings.sql)
-- ============================================================
-- Ejecuta la lógica SQL REAL (no un espejo) contra una base DESECHABLE con
-- todas las migraciones aplicadas. Nunca contra producción: todo corre
-- dentro de una transacción que termina en ROLLBACK, pero igual requiere
-- privilegios de superusuario para simular auth.uid().
--
--   psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/test-launch-offer.sql
--
-- auth.uid() se simula vía request.jwt.claim.sub (el mismo GUC que lee
-- Supabase). Cada aserción falla con RAISE EXCEPTION 'FAIL: ...'.
-- ============================================================

BEGIN;

-- ─── Helpers de prueba ──────────────────────────────────────────────────
CREATE FUNCTION pg_temp.as_user(p_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(p_id::text, ''), true);
$$;

CREATE FUNCTION pg_temp.bog(p timestamptz) RETURNS text LANGUAGE sql AS $$
  SELECT to_char(p AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI');
$$;

CREATE FUNCTION pg_temp.eq(p_actual text, p_expected text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL: % — esperado %, obtenido %', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'ok  %', p_label;
END;
$$;

-- ─── 1. Meses calendario (America/Bogota) ───────────────────────────────
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2026-11-20 10:00-05', 3, 30)),
  '2027-02-20 10:00', 'ejemplo del prompt: 20-nov-2026 → 20-feb-2027');
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2026-11-30 09:00-05', 3, 30)),
  '2027-02-28 09:00', 'fin de mes: 30-nov → 28-feb (febrero no bisiesto)');
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2027-11-30 09:00-05', 3, 30)),
  '2028-02-29 09:00', 'fin de mes: 30-nov-2027 → 29-feb-2028 (bisiesto)');
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2026-10-31 12:00-05', 3, 30)),
  '2027-01-31 12:00', 'cambio de año: 31-oct-2026 → 31-ene-2027');
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2026-12-31 08:00-05', 3, 30)),
  '2027-03-31 08:00', 'cambio de año: 31-dic-2026 → 31-mar-2027');
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2026-11-29 15:00-05', 3, 30)),
  '2027-02-28 15:00', '29-nov → 28-feb (día ajustado al último real)');
-- 23:30 en Bogotá ya es 1-dic en UTC: el mes calendario es el del club, no
-- el de UTC (sin la conversión esto daría 1-mar en vez de 28-feb).
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2026-11-30 23:30-05', 3, 30)),
  '2027-02-28 23:30', 'zona horaria: 30-nov 23:30 Bogotá (=1-dic UTC) → 28-feb 23:30');
SELECT pg_temp.eq(pg_temp.bog(public.compute_trial_ends_at('2026-11-20 10:00-05', NULL, 30)),
  '2026-12-20 10:00', 'trial_months NULL → respaldo en días (comportamiento previo)');
SELECT pg_temp.eq(
  (public.compute_trial_ends_at('2026-11-20 10:00-05', 3, 30) - '2026-11-20 10:00-05'::timestamptz)::text,
  '92 days', 'no son 90 días fijos (nov→feb = 92 días)');

-- ─── 2. Oferta vigente / fuente única de precio ─────────────────────────
SELECT pg_temp.eq(
  (SELECT trial_months::text || '|' || promo_enabled::text || '|' || promo_monthly_price::text
   FROM public.commercial_settings LIMIT 1),
  '3|true|99900', 'commercial_settings: 3 meses, promo COP 99.900');

SET LOCAL ROLE anon;
SELECT pg_temp.eq(
  (SELECT monthly_price::text || '|' || currency || '|' || trial_months::text
   FROM public.get_public_commercial_offer()),
  '99900|COP|3', 'anon lee la oferta pública');
RESET ROLE;

-- ─── Actores ────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'superadmin@test.local'),
  ('00000000-0000-0000-0000-00000000a002', 'futuro-owner@test.local'),
  ('00000000-0000-0000-0000-00000000a003', 'jugador@test.local'),
  ('00000000-0000-0000-0000-00000000a004', 'owner-existente@test.local');

UPDATE public.profiles SET is_platform_admin = true, account_type = 'SUPERADMIN'
WHERE id = '00000000-0000-0000-0000-00000000a001';
UPDATE public.profiles SET account_type = 'PLAYER' WHERE id = '00000000-0000-0000-0000-00000000a003';
UPDATE public.profiles SET account_type = 'OWNER' WHERE id = '00000000-0000-0000-0000-00000000a004';

-- ─── 3. Autorregistro de clubes bloqueado ───────────────────────────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_actor uuid;
BEGIN
  FOREACH v_actor IN ARRAY ARRAY[
    '00000000-0000-0000-0000-00000000a002'::uuid, -- cuenta recién registrada (sin tipo)
    '00000000-0000-0000-0000-00000000a003'::uuid  -- PLAYER
  ] LOOP
    PERFORM pg_temp.as_user(v_actor);
    BEGIN
      PERFORM public.create_club_with_owner('Club Pirata', 'club-pirata-' || right(v_actor::text, 4), 'public');
      RAISE EXCEPTION 'FAIL: % pudo crear un club por autorregistro', v_actor;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'ok  create_club_with_owner rechaza a % (42501)', v_actor;
    END;
  END LOOP;

  -- anon no tiene EXECUTE en absoluto.
  PERFORM pg_temp.as_user(NULL);
END;
$$;
RESET ROLE;

SELECT pg_temp.eq(
  (SELECT account_type FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000a002'),
  NULL, 'la cuenta sin tipo sigue sin tipo (no se autoasignó OWNER)');

-- OWNER real conserva su uso legítimo (club adicional).
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000a004');
SELECT pg_temp.eq((SELECT slug FROM public.create_club_with_owner('Club Adicional', 'club-adicional-qa', 'public')),
  'club-adicional-qa', 'OWNER existente aún puede crear un club adicional');
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.create_club_with_owner('Anon', 'anon-club-qa', 'public');
  RAISE EXCEPTION 'FAIL: anon ejecutó create_club_with_owner';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  anon sin EXECUTE sobre create_club_with_owner';
END;
$$;

-- ─── 4. Lead público: nunca crea club ni OWNER ──────────────────────────
SELECT pg_temp.eq(public.create_commercial_lead('Ana QA', 'Club Lead QA', 'Bogotá', '+57 300 123 4567', 4, true, NULL)::text,
  'true', 'anon crea un lead');
DO $$
BEGIN
  PERFORM public.platform_convert_lead_to_pending_club(gen_random_uuid(), 'X', 'x-qa-anon', 'public');
  RAISE EXCEPTION 'FAIL: anon ejecutó la conversión de lead';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  anon no puede convertir leads';
END;
$$;
RESET ROLE;

SELECT pg_temp.eq(
  (SELECT status || '|' || source || '|' || COALESCE(converted_club_id::text, 'null')
   FROM public.commercial_leads WHERE club_name = 'Club Lead QA'),
  'new|website|null', 'lead queda new/website sin club');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.clubs WHERE name = 'Club Lead QA'),
  '0', 'el formulario no creó ningún club');

-- Ids resueltos como superusuario: los roles de cliente no leen estas
-- tablas (RLS cerrada), así que los bloques de abajo los reciben por GUC.
SELECT set_config('qa.lead_id', (SELECT id::text FROM public.commercial_leads WHERE club_name = 'Club Lead QA'), true);

-- PLAYER autenticado tampoco puede convertir (gate SUPERADMIN real).
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000a003');
DO $$
DECLARE v_lead uuid := current_setting('qa.lead_id')::uuid;
BEGIN
  BEGIN
    PERFORM public.platform_convert_lead_to_pending_club(v_lead, 'Club Lead QA', 'club-lead-qa', 'public');
    RAISE EXCEPTION 'FAIL: PLAYER convirtió un lead';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'ok  PLAYER no puede convertir leads (%)', SQLERRM;
  END;
END;
$$;

-- ─── 5. Conversión autorizada → club pendiente → claim → trial ──────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000a001');
DO $$
DECLARE v_lead uuid := current_setting('qa.lead_id')::uuid;
BEGIN
  -- Antes de demo_completed la conversión se rechaza.
  BEGIN
    PERFORM public.platform_convert_lead_to_pending_club(v_lead, 'Club Lead QA', 'club-lead-qa', 'public');
    RAISE EXCEPTION 'FAIL: lead convertido antes de demo_completed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'not_demo_completed%' THEN RAISE; END IF;
    RAISE NOTICE 'ok  conversión rechazada antes de demo_completed';
  END;
  PERFORM public.update_commercial_lead_status(v_lead, 'demo_completed', NULL, NULL);
  PERFORM public.platform_convert_lead_to_pending_club(v_lead, 'Club Lead QA', 'club-lead-qa', 'public');
  RAISE NOTICE 'ok  SUPERADMIN convierte el lead tras demo_completed';
END;
$$;
RESET ROLE;

SELECT pg_temp.eq(
  (SELECT c.pending_claim::text || '|' || l.status FROM public.clubs c
   JOIN public.commercial_leads l ON l.converted_club_id = c.id WHERE c.slug = 'club-lead-qa'),
  'true|won', 'lead convertido en club pendiente');
SELECT pg_temp.eq(
  (SELECT count(*)::text FROM public.club_subscriptions s JOIN public.clubs c ON c.id = s.club_id WHERE c.slug = 'club-lead-qa'),
  '0', 'club pendiente: el trial todavía NO empezó');

SELECT set_config('qa.club_id', (SELECT id::text FROM public.clubs WHERE slug = 'club-lead-qa'), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000a001');
SELECT public.platform_generate_club_claim_link(current_setting('qa.club_id')::uuid, repeat('ab', 32));
RESET ROLE;
SELECT pg_temp.eq(
  (SELECT count(*)::text FROM public.club_subscriptions s JOIN public.clubs c ON c.id = s.club_id WHERE c.slug = 'club-lead-qa'),
  '0', 'enlace de claim generado: el trial todavía NO empezó');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000a002');
SELECT pg_temp.eq((public.claim_club(repeat('ab', 32), NULL) ->> 'success'), 'true', 'OWNER definitivo reclama el club');
RESET ROLE;

SELECT pg_temp.eq(
  (SELECT s.status || '|' || (s.trial_started_at = now())::text || '|' ||
          (s.trial_ends_at = public.compute_trial_ends_at(now(), 3, 30))::text || '|' ||
          (s.current_period_end = s.trial_ends_at)::text
   FROM public.club_subscriptions s JOIN public.clubs c ON c.id = s.club_id WHERE c.slug = 'club-lead-qa'),
  'trialing|true|true|true', 'trial de 3 meses calendario persistido desde claim_club()');
SELECT pg_temp.eq(
  (SELECT p.status || '|' || p.final_price::text || '|' || (p.period_end = s.trial_ends_at)::text
   FROM public.subscription_periods p JOIN public.club_subscriptions s ON s.id = p.subscription_id
   JOIN public.clubs c ON c.id = s.club_id WHERE c.slug = 'club-lead-qa'),
  'trial|0|true', 'período trial a $0 con el mismo fin');
SELECT pg_temp.eq(
  (SELECT count(*)::text FROM public.payments pay JOIN public.club_subscriptions s ON s.id = pay.subscription_id
   JOIN public.clubs c ON c.id = s.club_id WHERE c.slug = 'club-lead-qa'),
  '0', 'ningún pago/cobro creado al activar');
SELECT pg_temp.eq(
  (SELECT account_type FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000a002'),
  'OWNER', 'el OWNER definitivo llega a OWNER solo vía claim');

-- ─── 6. /platform/settings: solo SUPERADMIN guarda trial_months ─────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000a003');
DO $$
BEGIN
  PERFORM public.update_platform_commercial_settings(120000, true, 1, 30, 12);
  RAISE EXCEPTION 'FAIL: PLAYER modificó commercial_settings';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  PLAYER no puede modificar la configuración comercial';
END;
$$;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000a001');
SELECT public.update_platform_commercial_settings(120000, true, 99900, 30, 3);
SELECT pg_temp.eq((SELECT trial_months::text FROM public.get_platform_commercial_settings()), '3',
  'SUPERADMIN guarda y relee trial_months');
RESET ROLE;

ROLLBACK;
