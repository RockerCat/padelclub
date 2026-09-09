-- ============================================================
-- Comercial v2 / Fase 1 — observabilidad SUPERADMIN del estado comercial
-- Mi Pádel Club
-- ============================================================
-- Una sola RPC sirve toda la sección "Estado comercial" de
-- /platform/clubs/[clubId]: hace LEFT JOIN de club_subscriptions contra
-- commercial_settings (fila única) para que un club todavía sin
-- suscripción (cualquier pending club antes de claim_club()) devuelva
-- igual una fila — con has_subscription=false y el resto de columnas de
-- suscripción en NULL — en vez de cero filas, así el caller nunca necesita
-- distinguir "no autorizado" de "sin suscripción todavía" por la forma del
-- resultado.
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
