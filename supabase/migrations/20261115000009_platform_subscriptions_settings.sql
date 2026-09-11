-- ============================================================
-- Comercial v2 / Fase 6 — Observabilidad y configuración SUPERADMIN
-- Mi Pádel Club
-- ============================================================
-- Objetivo: dar a Platform Superadmin visibilidad operativa sobre
-- suscripciones/periodos/pagos de cada club, y permitir administrar
-- commercial_settings sin Supabase SQL Editor.
--
-- Esta migración es puramente de OBSERVABILIDAD + CONFIGURACIÓN GLOBAL —
-- no agrega ningún bypass del lifecycle comercial existente (Fase 1-3):
-- ninguna función de acá escribe club_subscriptions, subscription_periods
-- ni payments. La única escritura es update_platform_commercial_settings,
-- y toca exclusivamente la fila singleton de commercial_settings — nunca
-- retroactivo (subscription_periods/payments ya guardan su propio
-- snapshot de precio y jamás se leen de nuevo de commercial_settings
-- después de crearse, ver 20261115000003/000007).
-- ============================================================

-- ─── get_platform_clubs_overview — extendida con estado comercial ─────────
-- Reproduce exactamente 20260723000001 (mismas primeras 10 columnas, mismo
-- orden) y agrega al final el estado comercial efectivo de cada club, para
-- que tanto /platform/clubs (columna "Suscripción") como /platform/
-- subscriptions (listado completo) puedan reutilizar una sola consulta —
-- en vez de una segunda función casi idéntica. Ningún caller existente
-- (platform/page.tsx, platform/clubs/page.tsx) se rompe: solo lee columnas
-- que ya existían, en las mismas posiciones.
--
-- last_payment_amount/currency vienen de `payments` (nunca de
-- club_subscriptions, que no tiene esas columnas — ver CLAUDE.md); es el
-- intento de pago más reciente sin importar su status (pending/declined/
-- approved/...), útil operacionalmente para detectar un pago rechazado
-- reciente, no solo el último aprobado.
DROP FUNCTION IF EXISTS public.get_platform_clubs_overview();

CREATE FUNCTION public.get_platform_clubs_overview()
RETURNS TABLE (
  id                    uuid,
  name                  text,
  slug                  text,
  visibility            text,
  is_active             boolean,
  created_at            timestamptz,
  owner_name            text,
  owner_email           text,
  player_count          bigint,
  court_count           bigint,
  has_subscription      boolean,
  commercial_status     text,
  trial_started_at      timestamptz,
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  next_billing_at       timestamptz,
  payer_name            text,
  payer_email           text,
  last_payment_status   text,
  last_payment_at       timestamptz,
  last_payment_amount   numeric,
  last_payment_currency text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    c.id,
    c.name,
    c.slug,
    c.visibility,
    c.is_active,
    c.created_at,
    p.full_name AS owner_name,
    u.email     AS owner_email,
    (SELECT count(*) FROM public.club_members pc
       WHERE pc.club_id = c.id AND pc.role = 'PLAYER' AND pc.is_active = true) AS player_count,
    (SELECT count(*) FROM public.courts ct
       WHERE ct.club_id = c.id AND ct.is_active = true) AS court_count,
    (cs.id IS NOT NULL)   AS has_subscription,
    cs.status             AS commercial_status,
    cs.trial_started_at,
    cs.trial_ends_at,
    cs.current_period_start,
    cs.current_period_end,
    cs.next_billing_at,
    payer.full_name       AS payer_name,
    payer_u.email         AS payer_email,
    lp.status              AS last_payment_status,
    COALESCE(lp.paid_at, lp.failed_at, lp.created_at) AS last_payment_at,
    lp.amount              AS last_payment_amount,
    lp.currency             AS last_payment_currency
  FROM public.clubs c
  LEFT JOIN LATERAL (
    SELECT cm.profile_id
    FROM public.club_members cm
    WHERE cm.club_id = c.id AND cm.role = 'OWNER' AND cm.is_active = true
    ORDER BY cm.joined_at ASC
    LIMIT 1
  ) om ON true
  LEFT JOIN public.profiles p   ON p.id = om.profile_id
  LEFT JOIN auth.users     u    ON u.id = om.profile_id
  LEFT JOIN public.club_subscriptions cs ON cs.club_id = c.id
  LEFT JOIN public.profiles payer   ON payer.id = cs.payer_profile_id
  LEFT JOIN auth.users     payer_u  ON payer_u.id = cs.payer_profile_id
  LEFT JOIN LATERAL (
    SELECT pay.status, pay.amount, pay.currency, pay.paid_at, pay.failed_at, pay.created_at
    FROM public.payments pay
    WHERE pay.club_id = c.id
    ORDER BY pay.created_at DESC
    LIMIT 1
  ) lp ON true
  WHERE EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  )
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_platform_clubs_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_clubs_overview() TO authenticated;

-- ─── get_platform_subscription_periods — historial de períodos ────────────
-- Angosta a propósito: nunca expone subscription_id ni ninguna otra tabla,
-- solo lo que /platform/clubs/[clubId] necesita mostrar en "Períodos".
CREATE OR REPLACE FUNCTION public.get_platform_subscription_periods(p_club_id uuid)
RETURNS TABLE (
  id              uuid,
  period_start    timestamptz,
  period_end      timestamptz,
  base_price      numeric,
  discount_amount numeric,
  final_price     numeric,
  currency        text,
  status          text,
  created_at      timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT sp.id, sp.period_start, sp.period_end, sp.base_price, sp.discount_amount,
         sp.final_price, sp.currency, sp.status, sp.created_at
  FROM public.subscription_periods sp
  JOIN public.club_subscriptions cs ON cs.id = sp.subscription_id
  WHERE cs.club_id = p_club_id
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.is_platform_admin = true
    )
  ORDER BY sp.period_start DESC;
$$;

REVOKE ALL ON FUNCTION public.get_platform_subscription_periods(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_subscription_periods(uuid) TO authenticated;

-- ─── get_platform_subscription_payments — historial de pagos ──────────────
-- Deliberadamente nunca expone raw_response (puede contener el payload
-- crudo de Wompi) ni ninguna columna de payment_events. provider_reference/
-- provider_transaction_id sí se exponen — son identificadores operacionales
-- útiles para soporte (buscar la transacción en el dashboard de Wompi),
-- nunca un secreto.
CREATE OR REPLACE FUNCTION public.get_platform_subscription_payments(p_club_id uuid)
RETURNS TABLE (
  id                      uuid,
  amount                  numeric,
  currency                text,
  status                  text,
  provider                text,
  payment_method          text,
  provider_reference      text,
  provider_transaction_id text,
  paid_at                 timestamptz,
  failed_at               timestamptz,
  created_at              timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT pay.id, pay.amount, pay.currency, pay.status, pay.provider, pay.payment_method,
         pay.provider_reference, pay.provider_transaction_id, pay.paid_at, pay.failed_at, pay.created_at
  FROM public.payments pay
  WHERE pay.club_id = p_club_id
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.is_platform_admin = true
    )
  ORDER BY pay.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_platform_subscription_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_subscription_payments(uuid) TO authenticated;

-- ─── get_platform_commercial_settings — lectura de la fila singleton ──────
-- El singleton está garantizado por la propia tabla (20261115000003):
-- commercial_settings_singleton_idx es un índice único sobre la expresión
-- constante (true), así que Postgres nunca permite una segunda fila —
-- nunca ninguna fila "id" fija/conocida a la que apuntar. LIMIT 1 no es
-- una suposición implícita: es exactamente lo que ya usan
-- create_pending_payment/initialize_club_trial/get_my_club_subscription
-- para leer esta misma tabla, y sigue siendo correcto porque el índice
-- hace estructuralmente imposible que exista una segunda fila entre la
-- que "elegir".
CREATE OR REPLACE FUNCTION public.get_platform_commercial_settings()
RETURNS TABLE (
  base_monthly_price  numeric,
  promo_enabled       boolean,
  promo_monthly_price numeric,
  trial_days          integer,
  currency            text,
  updated_at          timestamptz,
  updated_by_name     text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT cset.base_monthly_price, cset.promo_enabled, cset.promo_monthly_price,
         cset.trial_days, cset.currency, cset.updated_at, p.full_name AS updated_by_name
  FROM public.commercial_settings cset
  LEFT JOIN public.profiles p ON p.id = cset.updated_by
  WHERE EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_platform_commercial_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_commercial_settings() TO authenticated;

-- ─── update_platform_commercial_settings — única escritura de esta fase ──
-- Solo toca la fila singleton de commercial_settings. Nunca escribe
-- club_subscriptions/subscription_periods/payments — un cambio de precio
-- acá afecta únicamente los períodos/pagos FUTUROS (los ya creados guardan
-- su propio snapshot, ver 20261115000003/000007). currency queda fuera de
-- este UPDATE deliberadamente (el sistema solo soporta COP hoy — ver
-- CLAUDE.md, no se agrega soporte multimoneda artificial acá).
--
-- El UPDATE de abajo lleva un WHERE id = v_settings_id explícito. No hay
-- ningún id fijo/conocido de antemano (commercial_settings_singleton_idx
-- es un índice único sobre la expresión constante (true), nunca sobre un
-- id — ver 20261115000003, eso sigue siendo lo que garantiza que exista a
-- lo sumo una fila), así que v_settings_id se resuelve en runtime con un
-- SELECT ... LIMIT 1 antes de escribir. Una versión anterior de esta
-- función omitía el WHERE por completo (razonando que sería tautológico
-- dado el singleton) y confiaba solo en `IF NOT FOUND` después del
-- UPDATE — un fallo real de QA confirmó que este proyecto de Supabase
-- rechaza cualquier UPDATE sin WHERE con SQLSTATE 21000 ("UPDATE requires
-- a WHERE clause"), sin importar que la tabla sea singleton. El
-- `IF NOT FOUND` posterior al UPDATE se conserva como defensa adicional
-- (mismo ERRCODE que initialize_club_trial usa para este mismo caso),
-- ahora inalcanzable en la práctica porque v_settings_id ya se validó
-- antes, pero inofensivo.
CREATE OR REPLACE FUNCTION public.update_platform_commercial_settings(
  p_base_monthly_price  numeric,
  p_promo_enabled       boolean,
  p_promo_monthly_price numeric,
  p_trial_days          integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_settings_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_base_monthly_price IS NULL OR p_base_monthly_price < 0 THEN
    RAISE EXCEPTION 'base_monthly_price must be >= 0' USING ERRCODE = '22023';
  END IF;

  IF p_trial_days IS NULL OR p_trial_days <= 0 THEN
    RAISE EXCEPTION 'trial_days must be > 0' USING ERRCODE = '22023';
  END IF;

  IF p_promo_monthly_price IS NOT NULL AND p_promo_monthly_price < 0 THEN
    RAISE EXCEPTION 'promo_monthly_price must be >= 0' USING ERRCODE = '22023';
  END IF;

  -- Promo activa siempre necesita un precio, y ese precio nunca debe ser
  -- mayor al precio base (una "promo" más cara que el precio normal no es
  -- una promo real). Desactivar la promo NUNCA borra p_promo_monthly_price
  -- — el caller (UI) sigue enviando el último valor configurado, y esta
  -- función simplemente lo persiste tal cual, nunca lo fuerza a NULL.
  IF p_promo_enabled AND (p_promo_monthly_price IS NULL OR p_promo_monthly_price > p_base_monthly_price) THEN
    RAISE EXCEPTION 'promo_monthly_price must be set and must not exceed base_monthly_price when promo is enabled' USING ERRCODE = '22023';
  END IF;

  -- Target explícito por id — el índice único sobre (true)
  -- (commercial_settings_singleton_idx, ver 20261115000003) sigue siendo
  -- lo que garantiza que exista a lo sumo una fila; esto solo resuelve cuál
  -- es esa fila para poder dirigirle un UPDATE con WHERE real. No hay un id
  -- fijo/conocido (la PK es un uuid aleatorio), así que se lee en runtime.
  SELECT id INTO v_settings_id FROM public.commercial_settings LIMIT 1;

  IF v_settings_id IS NULL THEN
    RAISE EXCEPTION 'update_platform_commercial_settings: commercial_settings has no row' USING ERRCODE = '55000';
  END IF;

  UPDATE public.commercial_settings
  SET base_monthly_price  = p_base_monthly_price,
      promo_enabled       = p_promo_enabled,
      promo_monthly_price = p_promo_monthly_price,
      trial_days          = p_trial_days,
      updated_by          = auth.uid()
  WHERE id = v_settings_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_platform_commercial_settings: commercial_settings has no row' USING ERRCODE = '55000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_commercial_settings(numeric, boolean, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_commercial_settings(numeric, boolean, numeric, integer) TO authenticated;
