-- ============================================================
-- Comercial v2 / Fase 1 — capa comercial base + trial de 30 días
-- Mi Pádel Club
-- ============================================================
-- La suscripción pertenece al CLUB, nunca al OWNER — el historial
-- comercial debe sobrevivir a un cambio de propietario. payer_profile_id
-- identifica quién paga hoy, nunca a quién pertenece la suscripción.
--
-- Estado comercial (trialing/active/past_due/suspended/cancelled) es un
-- concepto completamente separado del estado operativo del club
-- (clubs.is_active/archived_at) — nunca se sobrecarga ni se reutiliza esa
-- columna. Un club puede estar operacionalmente activo sin ninguna
-- suscripción comercial (todo pending club antes de claim_club()).
--
-- Esta fase solo produce el estado 'trialing' con precio $0 — el esquema
-- queda preparado para active/past_due/suspended/cancelled, pero esa
-- lógica (cobro real, Wompi, entitlement, bloqueos) es una fase futura y
-- no se construye aquí. Ver CLAUDE.md → Funnel Comercial Principles para
-- el checkpoint exacto de cuándo empieza el trial (claim_club() exitoso,
-- nunca antes).
-- ============================================================

-- ─── commercial_settings — configuración comercial centralizada ──────────
-- Una sola fila global para esta fase (índice único sobre una expresión
-- constante — patrón estándar de Postgres para tablas "singleton": ningún
-- CHECK ni trigger puede impedir un segundo INSERT, pero un índice único sí).
-- Los valores se guardan en unidades monetarias normales COP, no en
-- centavos Wompi — esa conversión, si hace falta, es responsabilidad de la
-- fase de pagos, nunca de este modelo.
CREATE TABLE public.commercial_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_monthly_price    numeric NOT NULL CHECK (base_monthly_price >= 0),
  promo_enabled         boolean NOT NULL DEFAULT false,
  promo_monthly_price   numeric CHECK (promo_monthly_price IS NULL OR promo_monthly_price >= 0),
  trial_days            integer NOT NULL CHECK (trial_days > 0),
  currency              text NOT NULL CHECK (length(currency) = 3),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES public.profiles(id)
);

CREATE UNIQUE INDEX commercial_settings_singleton_idx ON public.commercial_settings ((true));

CREATE TRIGGER set_commercial_settings_updated_at
  BEFORE UPDATE ON public.commercial_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.commercial_settings ENABLE ROW LEVEL SECURITY;
-- Cerrada a todo rol de cliente, mismo patrón que commercial_leads/
-- club_claim_links — la única lectura es get_platform_club_commercial_status
-- (migración siguiente), y la única escritura server-side es
-- initialize_club_trial más abajo, ambas SECURITY DEFINER.
REVOKE ALL ON public.commercial_settings FROM PUBLIC, anon, authenticated;

-- Fila inicial única — valores reales del negocio hoy. Cambiar estos
-- valores después vía UPDATE nunca debe alterar retroactivamente un
-- subscription_periods ya creado (ver esa tabla más abajo: cada período
-- guarda su propio snapshot de precio).
INSERT INTO public.commercial_settings
  (base_monthly_price, promo_enabled, promo_monthly_price, trial_days, currency)
VALUES
  (120000, true, 99990, 30, 'COP');

-- ─── club_subscriptions — una fila comercial por club ─────────────────────
CREATE TABLE public.club_subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE, no solo un índice de búsqueda: es la garantía real de
  -- idempotencia — a lo sumo una suscripción por club, para siempre.
  club_id               uuid NOT NULL UNIQUE REFERENCES public.clubs(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'trialing'
                          CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_started_at      timestamptz,
  trial_ends_at         timestamptz,
  current_period_start  timestamptz NOT NULL,
  current_period_end    timestamptz NOT NULL,
  -- Quién paga hoy — nunca de quién "es" la suscripción (ver comentario de
  -- cabecera). Un futuro cambio de OWNER no reescribe este historial; solo
  -- una fase de pagos futura decidiría si/cuándo actualizarlo.
  payer_profile_id      uuid NOT NULL REFERENCES public.profiles(id),
  auto_renew            boolean NOT NULL DEFAULT true,
  next_billing_at       timestamptz,
  last_payment_at       timestamptz,
  last_payment_status   text,
  suspended_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (current_period_end > current_period_start),
  CHECK (
    (trial_started_at IS NULL AND trial_ends_at IS NULL)
    OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_ends_at > trial_started_at)
  )
);

CREATE INDEX club_subscriptions_status_idx ON public.club_subscriptions (status);

CREATE TRIGGER set_club_subscriptions_updated_at
  BEFORE UPDATE ON public.club_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.club_subscriptions ENABLE ROW LEVEL SECURITY;
-- Cerrada a todo rol de cliente — ni OWNER ni ADMIN ni PLAYER pueden leer o
-- alterar su propio estado comercial directamente; nadie puede escribir su
-- propio `status`. Toda lectura pasa por una RPC SECURITY DEFINER
-- SUPERADMIN-only (migración siguiente); la única escritura es
-- initialize_club_trial (interna, ver más abajo). Una UI OWNER para ver su
-- propia suscripción queda fuera de esta fase (ver Prompt) — cuando exista,
-- será otra RPC self-only del mismo estilo que get_my_club_sport_profile,
-- nunca una policy RLS directa sobre esta tabla.
REVOKE ALL ON public.club_subscriptions FROM PUBLIC, anon, authenticated;

-- ─── subscription_periods — historia de períodos + snapshot de precio ─────
CREATE TABLE public.subscription_periods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES public.club_subscriptions(id) ON DELETE CASCADE,
  period_start     timestamptz NOT NULL,
  period_end       timestamptz NOT NULL,
  -- Snapshot del precio vigente al crear este período — un cambio futuro en
  -- commercial_settings nunca reescribe un período ya creado.
  base_price       numeric NOT NULL CHECK (base_price >= 0),
  discount_amount  numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_price      numeric NOT NULL CHECK (final_price >= 0),
  currency         text NOT NULL CHECK (length(currency) = 3),
  status           text NOT NULL CHECK (status IN ('trial', 'pending', 'paid', 'failed', 'expired')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

CREATE INDEX subscription_periods_subscription_id_idx ON public.subscription_periods (subscription_id, period_start DESC);

-- A lo sumo un período 'trial' por suscripción, para siempre — incluso si
-- initialize_club_trial se invocara dos veces por algún camino futuro no
-- previsto hoy, este índice parcial lo impide a nivel de base de datos, no
-- solo por la lógica defensiva de la función.
CREATE UNIQUE INDEX subscription_periods_one_trial_per_subscription
  ON public.subscription_periods (subscription_id) WHERE status = 'trial';

CREATE TRIGGER set_subscription_periods_updated_at
  BEFORE UPDATE ON public.subscription_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscription_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_periods FROM PUBLIC, anon, authenticated;

-- ─── initialize_club_trial — helper interno, invocado solo por claim_club ─
-- Helper interno, nunca una RPC pública: sin EXECUTE para ningún rol de
-- cliente (ver REVOKE explícito más abajo). Además de eso, valida
-- internamente que el payer sea tanto el caller autenticado
-- (p_payer_profile_id = auth.uid()) como OWNER activo real del club — dos
-- checks independientes, ninguno sustituye al otro.
--
-- Idempotente por construcción: club_subscriptions.club_id es UNIQUE, el
-- INSERT usa ON CONFLICT DO NOTHING, y si no se insertó nada (ya existía
-- una suscripción para este club) la función retorna sin crear ningún
-- período — un reintento de claim_club, o cualquier segunda invocación,
-- nunca duplica nada.
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

  SELECT cs.currency, cs.trial_days INTO v_currency, v_trial_days
  FROM public.commercial_settings AS cs
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'initialize_club_trial: commercial_settings has no row' USING ERRCODE = '55000';
  END IF;

  v_trial_ends_at := v_trial_started_at + make_interval(days => v_trial_days);

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

  -- El trial es explícitamente gratuito: base_price/discount_amount/
  -- final_price son 0 sin importar la promo o el precio base configurados
  -- — esos solo aplican a períodos futuros de cobro real, no a este.
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
