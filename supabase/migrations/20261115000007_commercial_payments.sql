-- ============================================================
-- Comercial v2 / Fase 3 — Pagos manuales con Wompi + ciclo comercial
-- Mi Pádel Club
-- ============================================================
-- Primer pago real: Wompi Web Checkout manual (Colombia). Sin cobro
-- automático, sin Payment Sources/tokenización, sin recurrencia — cada
-- pago es un checkout manual iniciado por el OWNER (nunca ADMIN/PLAYER).
--
-- Ciclo comercial (ver CLAUDE.md → Commercial Subscription Principles para
-- el detalle permanente):
--   claim_club() → trialing (30 días, ya existente, sin cambios)
--   trial vencido sin pago → gracia de 14 días (status sigue 'trialing';
--     entitlement ya permite; el banner distingue trial real de gracia
--     derivando la fecha, sin ninguna columna nueva — ver
--     shared/commercial/lifecycle.ts)
--   gracia vencida sin pago → 'suspended'
--   active vencido sin pago nuevo → 'past_due' (30 días de gracia,
--     entitlement ya permite)
--   past_due vencido sin pago → 'suspended'
--   pago APPROVED en cualquier momento → 'active', nuevo período mensual
--
-- Deliberadamente SIN columnas nuevas de "grace_ends_at"/"past_due_at":
-- ambos deadlines son funciones puras de columnas que ya existen y nunca
-- cambian una vez fijadas (`trial_ends_at`, `current_period_end`), así que
-- persistir un deadline aparte solo arriesgaría que se desincronizara de su
-- fuente real. `_require_commercial_access`/`get_club_commercial_access`
-- (Fase 2) NO se reescriben — su regla (todo excepto 'suspended' permite)
-- ya cubre trialing-en-gracia y past_due sin ningún cambio.
-- ============================================================

-- ─── payments ──────────────────────────────────────────────────────────────
CREATE TABLE public.payments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                 uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  subscription_id         uuid NOT NULL REFERENCES public.club_subscriptions(id) ON DELETE CASCADE,
  -- NULL hasta que el pago se aprueba y compra un período real — nunca se
  -- asigna en 'pending', nunca antes de la aprobación.
  subscription_period_id  uuid REFERENCES public.subscription_periods(id),
  provider                text NOT NULL DEFAULT 'wompi' CHECK (provider = 'wompi'),
  provider_transaction_id text,
  -- La NUESTRA, generada por create_pending_payment antes de enviar al
  -- OWNER a Wompi — única, nunca reutilizada ni siquiera tras un DECLINED
  -- (cada intento nuevo es una fila nueva con una referencia nueva).
  provider_reference      text NOT NULL UNIQUE,
  -- Snapshot de precio al momento del checkout (nunca leído de nuevo de
  -- commercial_settings después) — se copia tal cual a subscription_periods
  -- cuando el pago se aprueba, para que un cambio de precio mientras el
  -- pago está en curso nunca altere lo que el cliente vio/aceptó pagar.
  base_price              numeric NOT NULL CHECK (base_price >= 0),
  discount_amount         numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  amount                  numeric NOT NULL CHECK (amount >= 0), -- final_price, unidades COP normales, nunca centavos
  currency                text NOT NULL CHECK (length(currency) = 3),
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'declined', 'voided', 'error')),
  payment_method          text,
  initiated_by            uuid NOT NULL REFERENCES public.profiles(id),
  paid_at                 timestamptz,
  failed_at               timestamptz,
  raw_response            jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_club_id_idx ON public.payments (club_id, created_at DESC);
CREATE INDEX payments_subscription_id_idx ON public.payments (subscription_id, created_at DESC);

-- A lo sumo un payment Wompi 'pending' por suscripción, garantizado por la
-- base de datos — no solo por un SELECT-antes-de-INSERT en
-- create_pending_payment, que dos requests concurrentes (doble click, dos
-- pestañas) podrían pasar ambas antes de que cualquiera de las dos
-- inserte. Con este índice, la segunda inserción concurrente choca contra
-- la restricción y create_pending_payment la resuelve reutilizando la fila
-- que ganó la carrera (ver esa función) — nunca un error visible al OWNER.
CREATE UNIQUE INDEX payments_one_pending_per_subscription_idx
  ON public.payments (subscription_id)
  WHERE provider = 'wompi' AND status = 'pending';

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- Cerrada a todo rol de cliente — el frontend nunca establece amount/
-- status/approved directamente. Escritura solo vía create_pending_payment
-- (OWNER, crea 'pending') y process_wompi_transaction_event (service_role,
-- desde el webhook). Lectura solo vía get_my_club_payments/
-- get_platform_club_commercial_status.
REVOKE ALL ON public.payments FROM PUBLIC, anon, authenticated;

-- ─── payment_events — auditoría + idempotencia del webhook ────────────────
CREATE TABLE public.payment_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id              uuid REFERENCES public.payments(id),
  provider                text NOT NULL DEFAULT 'wompi' CHECK (provider = 'wompi'),
  provider_transaction_id text,
  event_type              text NOT NULL,
  status                  text,
  checksum                text,
  payload                 jsonb NOT NULL,
  processed_at            timestamptz,
  processing_error        text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_events_payment_id_idx ON public.payment_events (payment_id, created_at DESC);

-- Idempotencia real: Wompi no documenta un id de evento propio distinto del
-- id de la transacción (verificado contra la documentación oficial vigente
-- en esta misma fase) — la clave práctica de deduplicación es
-- (provider, provider_transaction_id, status): un mismo cambio de estado
-- reenviado/reintentado produce la misma terna y el segundo INSERT no
-- inserta nada (ON CONFLICT DO NOTHING en process_wompi_transaction_event).
-- Parcial porque un evento malformado sin transaction_id/status igual debe
-- poder auditarse sin que la restricción se lo impida.
CREATE UNIQUE INDEX payment_events_dedup_idx
  ON public.payment_events (provider, provider_transaction_id, status)
  WHERE provider_transaction_id IS NOT NULL AND status IS NOT NULL;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM PUBLIC, anon, authenticated;

-- ─── create_pending_payment — inicia un checkout, OWNER real únicamente ───
-- Precio derivado 100% server-side de commercial_settings — nunca del
-- cliente. Restringido a una fila club_members real con role='OWNER'
-- (nunca effective_club_role): mover dinero real es una acción que jamás
-- debe poder disparar el acceso elevado de SUPERADMIN ("Entrar al club"),
-- a diferencia de casi todo lo demás en la plataforma — no se detectó una
-- necesidad real de excepción para soporte, ver reporte de esta fase.
--
-- A lo sumo un payment Wompi 'pending' por suscripción — nunca dos, para
-- que un doble click/doble pestaña/doble request nunca produzca un doble
-- cobro involuntario. Dos capas: (1) el propio `FOR UPDATE` sobre
-- club_subscriptions ya serializa dos llamadas concurrentes para la MISMA
-- suscripción (la segunda espera a que la primera termine, y entonces ve
-- el pending recién creado en su propia SELECT); (2)
-- payments_one_pending_per_subscription_idx es la garantía real a nivel de
-- base de datos para cualquier caso límite que (1) no cubriera — si el
-- INSERT choca contra ese índice, se reutiliza el pending que ganó la
-- carrera en vez de propagar el error al OWNER.
CREATE OR REPLACE FUNCTION public.create_pending_payment(p_club_id uuid)
RETURNS TABLE (payment_id uuid, provider_reference text, amount numeric, currency text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_subscription_id uuid;
  v_base_price      numeric;
  v_promo_enabled   boolean;
  v_promo_price     numeric;
  v_currency        text;
  v_final_price     numeric;
  v_discount        numeric;
  v_reference       text;
  v_payment_id      uuid;
  v_existing        public.payments%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.role = 'OWNER' AND cm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Only the club OWNER can initiate a payment' USING ERRCODE = '42501';
  END IF;

  SELECT cs.id INTO v_subscription_id
  FROM public.club_subscriptions AS cs
  WHERE cs.club_id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This club has no commercial subscription yet' USING ERRCODE = 'P0002';
  END IF;

  -- Reutilizar un pending existente (creado por un intento anterior que
  -- todavía no se resolvió) en vez de crear uno segundo. Un pending que ya
  -- terminó en declined/voided/error no cuenta aquí — ese sí debe poder
  -- generar un intento nuevo con una referencia nueva.
  SELECT * INTO v_existing
  FROM public.payments AS pay
  WHERE pay.subscription_id = v_subscription_id
    AND pay.provider = 'wompi'
    AND pay.status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.provider_reference, v_existing.amount, v_existing.currency;
    RETURN;
  END IF;

  SELECT settings.base_monthly_price, settings.promo_enabled, settings.promo_monthly_price, settings.currency
  INTO v_base_price, v_promo_enabled, v_promo_price, v_currency
  FROM public.commercial_settings AS settings
  LIMIT 1;

  IF v_promo_enabled AND v_promo_price IS NOT NULL THEN
    v_final_price := v_promo_price;
  ELSE
    v_final_price := v_base_price;
  END IF;
  v_discount := v_base_price - v_final_price;

  -- Referencia única, alfanumérica con guiones bajos (formato aceptado por
  -- Wompi) — nunca reutilizada tras un intento fallido: cada intento nuevo
  -- (tras declined/voided/error) crea una fila y una referencia nuevas.
  v_reference := 'sub_' || replace(gen_random_uuid()::text, '-', '');

  BEGIN
    INSERT INTO public.payments AS pay (
      club_id, subscription_id, provider, provider_reference,
      base_price, discount_amount, amount, currency, status, initiated_by
    ) VALUES (
      p_club_id, v_subscription_id, 'wompi', v_reference,
      v_base_price, v_discount, v_final_price, v_currency, 'pending', auth.uid()
    )
    RETURNING pay.id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    -- payments_one_pending_per_subscription_idx: otra transacción
    -- concurrente ganó la carrera y ya insertó el pending — nunca un error
    -- visible al OWNER, se reutiliza esa fila.
    SELECT * INTO v_existing
    FROM public.payments AS pay
    WHERE pay.subscription_id = v_subscription_id
      AND pay.provider = 'wompi'
      AND pay.status = 'pending'
    LIMIT 1;

    RETURN QUERY SELECT v_existing.id, v_existing.provider_reference, v_existing.amount, v_existing.currency;
    RETURN;
  END;

  RETURN QUERY SELECT v_payment_id, v_reference, v_final_price, v_currency;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pending_payment(uuid) TO authenticated;

-- ─── process_wompi_transaction_event — única fuente de verdad, webhook ────
-- Invocada exclusivamente desde el endpoint de webhook (Route Handler),
-- DESPUÉS de validar el checksum de Wompi ahí mismo con el events secret
-- (nunca antes) — esta función confía en que el caller ya validó la firma;
-- por eso mismo está cerrada a anon/authenticated y solo se otorga a
-- service_role, que solo el servidor puede invocar (nunca expuesta por
-- PostgREST a ningún rol de sesión de cliente).
--
-- Idempotente en dos capas: (1) payment_events_dedup_idx a nivel de evento
-- (mismo transaction_id+status reenviado = no-op), (2) el propio estado del
-- payment (un payment ya 'approved'/'declined'/'voided'/'error' nunca se
-- reprocesa, sin importar qué traiga un evento posterior).
CREATE OR REPLACE FUNCTION public.process_wompi_transaction_event(
  p_reference               text,
  p_provider_transaction_id text,
  p_status                  text,
  p_amount_in_cents         bigint,
  p_currency                text,
  p_raw_payload             jsonb,
  p_checksum                text DEFAULT NULL,
  p_payment_method          text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_normalized_status text;
  v_payment           public.payments%ROWTYPE;
  v_event_id          uuid;
  v_subscription      public.club_subscriptions%ROWTYPE;
  v_new_period_start  timestamptz;
  v_new_period_end    timestamptz;
  v_period_id         uuid;
BEGIN
  v_normalized_status := CASE upper(COALESCE(p_status, ''))
    WHEN 'APPROVED' THEN 'approved'
    WHEN 'DECLINED' THEN 'declined'
    WHEN 'VOIDED'   THEN 'voided'
    WHEN 'ERROR'    THEN 'error'
    WHEN 'PENDING'  THEN 'pending'
    ELSE 'error'
  END;

  INSERT INTO public.payment_events AS ev (
    provider, provider_transaction_id, event_type, status, checksum, payload
  ) VALUES (
    'wompi', p_provider_transaction_id, 'transaction.updated', v_normalized_status, p_checksum, p_raw_payload
  )
  ON CONFLICT (provider, provider_transaction_id, status)
    WHERE provider_transaction_id IS NOT NULL AND status IS NOT NULL
  DO NOTHING
  RETURNING ev.id INTO v_event_id;

  IF v_event_id IS NULL THEN
    -- Reenvío exacto de un evento ya procesado — no-op silencioso.
    RETURN;
  END IF;

  SELECT * INTO v_payment FROM public.payments AS p
  WHERE p.provider_reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_events SET processed_at = now(), processing_error = 'unknown_reference' WHERE id = v_event_id;
    RETURN;
  END IF;

  UPDATE public.payment_events SET payment_id = v_payment.id WHERE id = v_event_id;

  IF v_payment.status IN ('approved', 'declined', 'voided', 'error') THEN
    UPDATE public.payment_events SET processed_at = now(), processing_error = 'payment_already_finalized' WHERE id = v_event_id;
    RETURN;
  END IF;

  IF v_normalized_status = 'pending' THEN
    UPDATE public.payments AS p
    SET provider_transaction_id = COALESCE(p_provider_transaction_id, p.provider_transaction_id),
        payment_method = COALESCE(p_payment_method, p.payment_method),
        updated_at = now()
    WHERE p.id = v_payment.id;
    UPDATE public.payment_events SET processed_at = now() WHERE id = v_event_id;
    RETURN;
  END IF;

  -- Nunca activar solo porque la referencia es conocida — moneda y monto
  -- deben coincidir exactamente con lo que create_pending_payment registró.
  IF p_currency IS DISTINCT FROM v_payment.currency
     OR p_amount_in_cents IS DISTINCT FROM (v_payment.amount * 100)::bigint THEN
    UPDATE public.payments AS p
    SET status = 'error', failed_at = now(), provider_transaction_id = p_provider_transaction_id,
        raw_response = p_raw_payload, updated_at = now()
    WHERE p.id = v_payment.id;
    UPDATE public.payment_events SET processed_at = now(), processing_error = 'amount_or_currency_mismatch' WHERE id = v_event_id;
    RETURN;
  END IF;

  IF v_normalized_status IN ('declined', 'voided', 'error') THEN
    UPDATE public.payments AS p
    SET status = v_normalized_status, failed_at = now(), provider_transaction_id = p_provider_transaction_id,
        payment_method = COALESCE(p_payment_method, p.payment_method),
        raw_response = p_raw_payload, updated_at = now()
    WHERE p.id = v_payment.id;
    UPDATE public.payment_events SET processed_at = now() WHERE id = v_event_id;
    RETURN;
  END IF;

  -- v_normalized_status = 'approved' — el único camino que activa el club.
  SELECT * INTO v_subscription FROM public.club_subscriptions AS cs
  WHERE cs.id = v_payment.subscription_id
  FOR UPDATE;

  -- Regla de período (única, documentada) — nunca perder días ya pagados
  -- NI días de trial todavía no consumidos:
  --   • 'trialing' con trial_ends_at todavía en el futuro (pago anticipado
  --     dentro del trial real) → el período pagado empieza cuando el trial
  --     iba a terminar, nunca antes — un pago el día 20 de un trial 9 sep
  --     → 9 oct debe seguir dando 9 oct → 9 nov, no 20 sep → 20 oct;
  --   • 'trialing' con trial_ends_at ya pasado (gracia post-trial) → el
  --     trial ya se agotó por completo, el período empieza en `now()`;
  --   • 'active' con current_period_end todavía en el futuro (renovación
  --     anticipada) → empieza en current_period_end, mismo principio que
  --     el caso de trial;
  --   • cualquier otro caso (active ya vencido, past_due, suspended) → no
  --     hay ningún día pendiente que preservar, empieza en `now()`.
  -- Esto NO cambia la duración del trial (30 días) ni la gracia post-trial
  -- (14 días) — ambas siguen derivándose únicamente de trial_ends_at en
  -- shared/commercial/lifecycle.ts, sin tocar.
  IF v_subscription.status = 'trialing'
     AND v_subscription.trial_ends_at IS NOT NULL
     AND v_subscription.trial_ends_at > now() THEN
    v_new_period_start := v_subscription.trial_ends_at;
  ELSIF v_subscription.status = 'trialing' THEN
    -- trial_ends_at ya pasado (o, defensivamente, nulo) — gracia post-trial.
    v_new_period_start := now();
  ELSIF v_subscription.status = 'active' AND v_subscription.current_period_end > now() THEN
    v_new_period_start := v_subscription.current_period_end;
  ELSE
    v_new_period_start := now();
  END IF;
  v_new_period_end := v_new_period_start + interval '1 month';

  INSERT INTO public.subscription_periods (
    subscription_id, period_start, period_end,
    base_price, discount_amount, final_price, currency, status
  ) VALUES (
    v_subscription.id, v_new_period_start, v_new_period_end,
    v_payment.base_price, v_payment.discount_amount, v_payment.amount, v_payment.currency, 'paid'
  )
  RETURNING id INTO v_period_id;

  UPDATE public.payments AS p
  SET status = 'approved',
      provider_transaction_id = p_provider_transaction_id,
      payment_method = COALESCE(p_payment_method, p.payment_method),
      paid_at = now(),
      raw_response = p_raw_payload,
      subscription_period_id = v_period_id,
      updated_at = now()
  WHERE p.id = v_payment.id;

  UPDATE public.club_subscriptions AS cs
  SET status = 'active',
      current_period_start = v_new_period_start,
      current_period_end = v_new_period_end,
      last_payment_at = now(),
      last_payment_status = 'approved',
      suspended_at = NULL,
      next_billing_at = v_new_period_end,
      updated_at = now()
  WHERE cs.id = v_subscription.id;

  UPDATE public.payment_events SET processed_at = now() WHERE id = v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_wompi_transaction_event(text, text, text, bigint, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_wompi_transaction_event(text, text, text, bigint, text, jsonb, text, text) TO service_role;

-- ─── run_commercial_lifecycle_transitions — cron diario, idempotente ──────
-- Invocada exclusivamente desde /api/cron/commercial-lifecycle (protegida
-- por CRON_SECRET, ver esa ruta), vía el cliente service_role — nunca
-- alcanzable por ningún rol de cliente. Cada UPDATE es idempotente por
-- construcción: su propio WHERE deja de matchear en cuanto la fila ya
-- transicionó, así que ejecutarla de nuevo el mismo día (o varias veces
-- por un reintento) nunca duplica ni repite ningún efecto.
CREATE OR REPLACE FUNCTION public.run_commercial_lifecycle_transitions()
RETURNS TABLE (
  transitioned_active_to_past_due       integer,
  transitioned_trial_grace_to_suspended integer,
  transitioned_past_due_to_suspended    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_past_due_count           integer;
  v_grace_suspended_count    integer;
  v_past_due_suspended_count integer;
BEGIN
  UPDATE public.club_subscriptions AS cs
  SET status = 'past_due', updated_at = now()
  WHERE cs.status = 'active' AND cs.current_period_end < now();
  GET DIAGNOSTICS v_past_due_count = ROW_COUNT;

  UPDATE public.club_subscriptions AS cs
  SET status = 'suspended', suspended_at = now(), updated_at = now()
  WHERE cs.status = 'trialing'
    AND cs.trial_ends_at IS NOT NULL
    AND cs.trial_ends_at + interval '14 days' < now();
  GET DIAGNOSTICS v_grace_suspended_count = ROW_COUNT;

  UPDATE public.club_subscriptions AS cs
  SET status = 'suspended', suspended_at = now(), updated_at = now()
  WHERE cs.status = 'past_due'
    AND cs.current_period_end + interval '30 days' < now();
  GET DIAGNOSTICS v_past_due_suspended_count = ROW_COUNT;

  RETURN QUERY SELECT v_past_due_count, v_grace_suspended_count, v_past_due_suspended_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_commercial_lifecycle_transitions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_commercial_lifecycle_transitions() TO service_role;

-- ─── get_my_club_subscription / get_my_club_payments — OWNER real, self ───
-- Mismo estilo self-only que get_my_club_sport_profile: nunca aceptan un
-- id ajeno, siempre derivan todo de auth.uid() + p_club_id.
CREATE OR REPLACE FUNCTION public.get_my_club_subscription(p_club_id uuid)
RETURNS TABLE (
  has_subscription      boolean,
  status                text,
  trial_started_at      timestamptz,
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  next_billing_at       timestamptz,
  auto_renew            boolean,
  last_payment_at       timestamptz,
  last_payment_status   text,
  suspended_at          timestamptz,
  base_monthly_price    numeric,
  promo_enabled         boolean,
  promo_monthly_price   numeric,
  currency              text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = '' AS $$
  SELECT
    (cs.id IS NOT NULL), cs.status, cs.trial_started_at, cs.trial_ends_at,
    cs.current_period_start, cs.current_period_end, cs.next_billing_at, cs.auto_renew,
    cs.last_payment_at, cs.last_payment_status, cs.suspended_at,
    settings.base_monthly_price, settings.promo_enabled, settings.promo_monthly_price, settings.currency
  FROM public.commercial_settings AS settings
  LEFT JOIN public.club_subscriptions AS cs ON cs.club_id = p_club_id
  WHERE EXISTS (
    SELECT 1 FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.role = 'OWNER' AND cm.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_club_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_club_subscription(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_club_payments(p_club_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE (
  id             uuid,
  amount         numeric,
  currency       text,
  status         text,
  payment_method text,
  paid_at        timestamptz,
  failed_at      timestamptz,
  created_at     timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = '' AS $$
  SELECT p.id, p.amount, p.currency, p.status, p.payment_method, p.paid_at, p.failed_at, p.created_at
  FROM public.payments AS p
  WHERE p.club_id = p_club_id
    AND EXISTS (
      SELECT 1 FROM public.club_members AS cm
      WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.role = 'OWNER' AND cm.is_active = true
    )
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_my_club_payments(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_club_payments(uuid, integer) TO authenticated;

-- ─── get_payment_status — pantalla de retorno de Wompi ────────────────────
-- La pantalla /[club]/subscription/payment-result recibe ?ref=<nuestra
-- referencia>&id=<transaction id de Wompi> por el redirect-url que nosotros
-- mismos configuramos — nunca confía en esos query params para cambiar
-- ningún estado (ver CLAUDE.md), solo los usa para CONSULTAR qué ya
-- procesó (o no) el webhook. Angosta a propósito: una sola fila, sin
-- exponer la tabla completa de payments.
CREATE OR REPLACE FUNCTION public.get_payment_status(p_reference text)
RETURNS TABLE (status text, amount numeric, currency text, club_slug text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = '' AS $$
  SELECT pay.status, pay.amount, pay.currency, c.slug
  FROM public.payments AS pay
  JOIN public.clubs AS c ON c.id = pay.club_id
  WHERE pay.provider_reference = p_reference
    AND EXISTS (
      SELECT 1 FROM public.club_members AS cm
      WHERE cm.club_id = pay.club_id AND cm.profile_id = auth.uid() AND cm.role = 'OWNER' AND cm.is_active = true
    );
$$;

REVOKE ALL ON FUNCTION public.get_payment_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_status(text) TO authenticated;

-- ─── get_club_commercial_access — extendida (Fase 2, misma regla) ─────────
-- Único cambio: agrega current_period_end al final del RETURNS TABLE, para
-- que el banner OWNER (shared/commercial/lifecycle.ts) pueda derivar el
-- deadline de gracia de past_due sin una segunda llamada. La regla de
-- entitlement en sí (v_allowed) es BYTE-IDÉNTICA a Fase 2 — no se reescribe.
DROP FUNCTION IF EXISTS public.get_club_commercial_access(uuid);

CREATE FUNCTION public.get_club_commercial_access(p_club_id uuid)
RETURNS TABLE (
  commercial_status     text,
  has_subscription      boolean,
  can_create_booking    boolean,
  can_create_tournament boolean,
  trial_ends_at         timestamptz,
  current_period_end    timestamptz
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_status              text;
  v_trial_ends_at       timestamptz;
  v_current_period_end  timestamptz;
  v_allowed             boolean;
BEGIN
  IF public.effective_club_role(p_club_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this club' USING ERRCODE = '42501';
  END IF;

  SELECT cs.status, cs.trial_ends_at, cs.current_period_end
  INTO v_status, v_trial_ends_at, v_current_period_end
  FROM public.club_subscriptions AS cs
  WHERE cs.club_id = p_club_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, false, true, true, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  v_allowed := (v_status IS DISTINCT FROM 'suspended');

  RETURN QUERY SELECT v_status, true, v_allowed, v_allowed, v_trial_ends_at, v_current_period_end;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_commercial_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_commercial_access(uuid) TO authenticated;

-- ─── get_platform_club_commercial_status — extendida (Fase 1, SUPERADMIN) ──
-- Único cambio: agrega last_payment_at/last_payment_status (columnas que
-- ya existían en club_subscriptions desde Fase 1, nunca antes expuestas
-- por esta RPC) para que SUPERADMIN pueda ver el último resultado de pago
-- sin abrir `payments` directamente. Nada más cambia.
DROP FUNCTION IF EXISTS public.get_platform_club_commercial_status(uuid);

CREATE FUNCTION public.get_platform_club_commercial_status(p_club_id uuid)
RETURNS TABLE (
  has_subscription      boolean,
  status                text,
  trial_started_at      timestamptz,
  trial_ends_at         timestamptz,
  trial_days_remaining  integer,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  next_billing_at       timestamptz,
  payer_profile_id      uuid,
  payer_name            text,
  payer_email           text,
  last_payment_at       timestamptz,
  last_payment_status   text,
  base_monthly_price    numeric,
  promo_enabled         boolean,
  promo_monthly_price   numeric,
  currency              text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT
    (cs.id IS NOT NULL) AS has_subscription,
    cs.status,
    cs.trial_started_at,
    cs.trial_ends_at,
    CASE
      WHEN cs.status = 'trialing' AND cs.trial_ends_at IS NOT NULL
        THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (cs.trial_ends_at - now())) / 86400))::integer
      ELSE NULL
    END AS trial_days_remaining,
    cs.current_period_start,
    cs.current_period_end,
    cs.next_billing_at,
    cs.payer_profile_id,
    p.full_name AS payer_name,
    u.email AS payer_email,
    cs.last_payment_at,
    cs.last_payment_status,
    settings.base_monthly_price,
    settings.promo_enabled,
    settings.promo_monthly_price,
    settings.currency
  FROM public.commercial_settings AS settings
  LEFT JOIN public.club_subscriptions AS cs ON cs.club_id = p_club_id
  LEFT JOIN public.profiles AS p ON p.id = cs.payer_profile_id
  LEFT JOIN auth.users AS u ON u.id = cs.payer_profile_id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles AS me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  );
$$;

REVOKE ALL ON FUNCTION public.get_platform_club_commercial_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_club_commercial_status(uuid) TO authenticated;
