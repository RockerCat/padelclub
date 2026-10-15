-- ============================================================
-- Lanzamiento comercial 2026/2027 — trial por meses calendario,
-- oferta pública de solo lectura y cierre del autorregistro de clubes
-- Mi Pádel Club
-- ============================================================
-- Tres cambios focalizados, sin ningún estado ni tabla nueva:
--
-- 1. commercial_settings.trial_months (nullable). Cuando está definido
--    tiene precedencia sobre trial_days: el trial dura N meses CALENDARIO,
--    calculados sobre el reloj de America/Bogota (20-nov-2026 10:00 →
--    20-feb-2027 10:00; 30-nov-2026 → 28-feb-2027, el día se ajusta al
--    último día real del mes destino — semántica nativa de Postgres para
--    `timestamp + interval 'N months'`). NULL conserva exactamente el
--    comportamiento previo (trial_days fijos). La única escritura sigue
--    siendo initialize_club_trial, invocada solo desde claim_club() — el
--    trial sigue empezando exclusivamente en la activación real del club.
--    Ninguna suscripción existente se toca: trial_ends_at ya persistido
--    nunca se recalcula.
--
-- 2. get_public_commercial_offer() — única lectura pública (anon) de
--    commercial_settings, limitada a lo que la landing necesita mostrar
--    (precio mensual efectivo, moneda, duración del trial). La landing
--    nunca hardcodea el precio: muestra lo mismo que create_pending_payment
--    cobraría, desde la misma fila.
--
-- 3. create_club_with_owner exige una cuenta OWNER existente. Antes
--    aceptaba también account_type IS NULL — cualquier cuenta recién
--    registrada (el registro público es de jugadores) podía llamar la RPC
--    directamente, convertirse en OWNER y crear un club sin pasar por
--    demo → lead → Entrega de Club → claim_club(). El único uso legítimo
--    que conserva es el de un OWNER real creando un club adicional.
--
-- Precio/duración vigentes de la campaña: ver la migración siguiente
-- (20261115000012), separada a propósito porque es un cambio de DATOS
-- comerciales, no de esquema.
-- ============================================================

-- ─── 1a. trial_months ────────────────────────────────────────────────────
ALTER TABLE public.commercial_settings
  ADD COLUMN IF NOT EXISTS trial_months integer
    CHECK (trial_months IS NULL OR trial_months BETWEEN 1 AND 24);

-- ─── 1b. compute_trial_ends_at — regla pura, única fuente del cálculo ────
-- Función pura (sin lecturas), testeable de forma aislada. Bogotá no tiene
-- horario de verano, así que la conversión ida/vuelta nunca desplaza la
-- hora; aun así se hace explícita para que el "mes calendario" sea el del
-- club y no el de la zona horaria de la sesión de Postgres (UTC).
CREATE OR REPLACE FUNCTION public.compute_trial_ends_at(
  p_started_at   timestamptz,
  p_trial_months integer,
  p_trial_days   integer
)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = '' AS $$
  SELECT CASE
    WHEN p_trial_months IS NOT NULL THEN
      ((p_started_at AT TIME ZONE 'America/Bogota') + make_interval(months => p_trial_months))
        AT TIME ZONE 'America/Bogota'
    ELSE
      p_started_at + make_interval(days => p_trial_days)
  END;
$$;

REVOKE ALL ON FUNCTION public.compute_trial_ends_at(timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;

-- ─── 1c. initialize_club_trial — mismo cuerpo, nuevo cálculo de fin ──────
-- Idéntico a 20261115000003 salvo la lectura de trial_months y el uso de
-- compute_trial_ends_at. Mismas validaciones, misma idempotencia
-- (ON CONFLICT (club_id) DO NOTHING), mismo período 'trial' a $0.
CREATE OR REPLACE FUNCTION public.initialize_club_trial(
  p_club_id          uuid,
  p_payer_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_subscription_id  uuid;
  v_currency         text;
  v_trial_days       integer;
  v_trial_months     integer;
  v_trial_started_at timestamptz := now();
  v_trial_ends_at    timestamptz;
BEGIN
  IF auth.uid() IS NULL OR p_payer_profile_id != auth.uid() THEN
    RAISE EXCEPTION 'initialize_club_trial: p_payer_profile_id must be the authenticated caller' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id
      AND cm.profile_id = p_payer_profile_id
      AND cm.role = 'OWNER'
      AND cm.is_active = true
  ) THEN
    RAISE EXCEPTION 'initialize_club_trial: payer is not an active OWNER of this club' USING ERRCODE = '42501';
  END IF;

  SELECT cs.currency, cs.trial_days, cs.trial_months
  INTO v_currency, v_trial_days, v_trial_months
  FROM public.commercial_settings AS cs
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'initialize_club_trial: commercial_settings has no row' USING ERRCODE = '55000';
  END IF;

  v_trial_ends_at := public.compute_trial_ends_at(v_trial_started_at, v_trial_months, v_trial_days);

  INSERT INTO public.club_subscriptions AS sub (
    club_id, status, trial_started_at, trial_ends_at,
    current_period_start, current_period_end,
    payer_profile_id, auto_renew, next_billing_at
  ) VALUES (
    p_club_id, 'trialing', v_trial_started_at, v_trial_ends_at,
    v_trial_started_at, v_trial_ends_at,
    p_payer_profile_id, true, v_trial_ends_at
  )
  ON CONFLICT (club_id) DO NOTHING
  RETURNING sub.id INTO v_subscription_id;

  IF v_subscription_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.subscription_periods (
    subscription_id, period_start, period_end,
    base_price, discount_amount, final_price, currency, status
  ) VALUES (
    v_subscription_id, v_trial_started_at, v_trial_ends_at,
    0, 0, 0, v_currency, 'trial'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_club_trial(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 1d. get/update_platform_commercial_settings — exponen trial_months ──
-- RETURNS TABLE cambia de forma → DROP + CREATE (CREATE OR REPLACE no
-- puede cambiar columnas de salida). Mismo gate SUPERADMIN.
DROP FUNCTION IF EXISTS public.get_platform_commercial_settings();

CREATE FUNCTION public.get_platform_commercial_settings()
RETURNS TABLE (
  base_monthly_price  numeric,
  promo_enabled       boolean,
  promo_monthly_price numeric,
  trial_days          integer,
  trial_months        integer,
  currency            text,
  updated_at          timestamptz,
  updated_by_name     text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT cset.base_monthly_price, cset.promo_enabled, cset.promo_monthly_price,
         cset.trial_days, cset.trial_months, cset.currency, cset.updated_at,
         p.full_name AS updated_by_name
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

-- Firma nueva (p_trial_months) → se elimina la de 4 argumentos para que
-- nunca convivan dos versiones. p_trial_months NULL = trial en días.
-- WHERE id = v_settings_id explícito: este proyecto rechaza UPDATE sin
-- WHERE (SQLSTATE 21000), ver 20261115000009.
DROP FUNCTION IF EXISTS public.update_platform_commercial_settings(numeric, boolean, numeric, integer);
DROP FUNCTION IF EXISTS public.update_platform_commercial_settings(numeric, boolean, numeric, integer, integer);

CREATE FUNCTION public.update_platform_commercial_settings(
  p_base_monthly_price  numeric,
  p_promo_enabled       boolean,
  p_promo_monthly_price numeric,
  p_trial_days          integer,
  p_trial_months        integer
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

  IF p_trial_months IS NOT NULL AND (p_trial_months < 1 OR p_trial_months > 24) THEN
    RAISE EXCEPTION 'trial_months must be between 1 and 24' USING ERRCODE = '22023';
  END IF;

  IF p_promo_monthly_price IS NOT NULL AND p_promo_monthly_price < 0 THEN
    RAISE EXCEPTION 'promo_monthly_price must be >= 0' USING ERRCODE = '22023';
  END IF;

  IF p_promo_enabled AND (p_promo_monthly_price IS NULL OR p_promo_monthly_price > p_base_monthly_price) THEN
    RAISE EXCEPTION 'promo_monthly_price must be set and must not exceed base_monthly_price when promo is enabled' USING ERRCODE = '22023';
  END IF;

  SELECT cset.id INTO v_settings_id FROM public.commercial_settings AS cset LIMIT 1;

  IF v_settings_id IS NULL THEN
    RAISE EXCEPTION 'update_platform_commercial_settings: commercial_settings has no row' USING ERRCODE = '55000';
  END IF;

  UPDATE public.commercial_settings AS cset
  SET base_monthly_price  = p_base_monthly_price,
      promo_enabled       = p_promo_enabled,
      promo_monthly_price = p_promo_monthly_price,
      trial_days          = p_trial_days,
      trial_months        = p_trial_months,
      updated_by          = auth.uid()
  WHERE cset.id = v_settings_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_commercial_settings(numeric, boolean, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_commercial_settings(numeric, boolean, numeric, integer, integer) TO authenticated;

-- ─── 2. get_public_commercial_offer — lectura pública mínima ─────────────
-- Precio efectivo = misma regla que create_pending_payment (promo si está
-- activa y definida, si no el base). No expone updated_by ni ningún otro
-- dato interno; la tabla sigue cerrada a todo rol de cliente.
CREATE OR REPLACE FUNCTION public.get_public_commercial_offer()
RETURNS TABLE (
  monthly_price numeric,
  currency      text,
  trial_months  integer,
  trial_days    integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT
    CASE
      WHEN cset.promo_enabled AND cset.promo_monthly_price IS NOT NULL THEN cset.promo_monthly_price
      ELSE cset.base_monthly_price
    END AS monthly_price,
    cset.currency,
    cset.trial_months,
    cset.trial_days
  FROM public.commercial_settings AS cset
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_commercial_offer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_commercial_offer() TO anon, authenticated;

-- ─── 3. create_club_with_owner — solo OWNER existente ────────────────────
-- Idéntica a 20261025000001 salvo la condición de account_type: antes
-- `IS NOT NULL AND != 'OWNER'` (dejaba pasar NULL), ahora
-- `IS DISTINCT FROM 'OWNER'`. Una cuenta sin tipo ya no puede
-- autoasignarse OWNER por esta vía; su único camino a OWNER es
-- claim_club() con un enlace emitido por SUPERADMIN.
CREATE OR REPLACE FUNCTION public.create_club_with_owner(
  p_name text,
  p_slug text,
  p_visibility text DEFAULT 'public'
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id uuid := gen_random_uuid();
  v_account_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility value' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_type INTO v_account_type FROM public.profiles AS p WHERE p.id = auth.uid();
  IF v_account_type IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'Only an existing OWNER account can create an additional club — new clubs are onboarded through Mi Pádel Club (demo → claim)'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.clubs (id, name, slug, visibility)
  VALUES (v_club_id, p_name, p_slug, p_visibility);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_club_id, auth.uid(), 'OWNER', true);

  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_with_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_with_owner(text, text, text) TO authenticated;
