-- ============================================================
-- Lanzamiento comercial 2026/2027 — valores de la oferta (DATOS)
-- Mi Pádel Club
-- ============================================================
-- Cambio de datos comerciales, separado a propósito del esquema
-- (20261115000011) para que pueda revisarse/aplicarse por sí solo.
-- Equivale exactamente a guardar estos valores desde /platform/settings:
--
--   - trial_months = 3          → 3 meses calendario desde claim_club().
--   - promo_enabled = true,
--     promo_monthly_price = 99900 → COP $99.900/mes (precio efectivo que
--                                   cobra create_pending_payment y que
--                                   muestra la landing).
--   - base_monthly_price y trial_days no se tocan (trial_days queda como
--     respaldo si trial_months se vuelve a NULL).
--
-- Afecta SOLO a trials y períodos futuros: club_subscriptions ya creadas
-- conservan su trial_ends_at, y subscription_periods/payments su propio
-- snapshot de precio. Idempotente: re-ejecutarla deja la misma fila.
-- WHERE explícito por id (este proyecto rechaza UPDATE sin WHERE).
UPDATE public.commercial_settings AS cset
SET trial_months        = 3,
    promo_enabled       = true,
    promo_monthly_price = 99900
WHERE cset.id = (SELECT c2.id FROM public.commercial_settings AS c2 LIMIT 1)
  AND cset.base_monthly_price >= 99900;
