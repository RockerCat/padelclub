-- ============================================================
-- Wompi comercio compartido con SolarDesk — prefijo PADEL- en reference
-- Mi Pádel Club
-- ============================================================
-- Wompi soporta oficialmente (confirmado por su propio soporte) que un
-- mismo comercio/llaves/events secret sea usado por más de una aplicación,
-- siempre que cada transacción sea identificable de forma inequívoca vía
-- `reference`. SolarDesk (otra aplicación de Alex, mismo comercio Wompi)
-- ya prefija TODAS sus referencias como `solardesk-pro-<uuid>` desde su
-- primer commit — nunca sin prefijo. Este cambio le da a Mi Pádel Club el
-- mismo tipo de prefijo explícito, `PADEL-<uuid-sin-guiones>`, en vez del
-- `sub_<uuid-sin-guiones>` anterior.
--
-- Esto es SOLO para referencias nuevas — nunca una migración retroactiva:
-- cualquier payment ya creado con el formato `sub_...` conserva su
-- provider_reference exactamente como está (columna UNIQUE, nunca tocada
-- por este cambio), y sigue resolviendo con normalidad en
-- process_wompi_transaction_event, que busca por igualdad exacta de
-- provider_reference sin importar el prefijo.
--
-- El único otro cambio real de esta fase (el endpoint de webhook
-- reenviando eventos de SolarDesk a su propio webhook cuando la reference
-- no es de Mi Pádel Club) vive en código TypeScript
-- (src/app/api/wompi/webhook/route.ts + src/lib/wompi/forwardToSolarDesk.ts
-- + shared/commercial/wompi.ts), nunca en SQL — esta migración es
-- exclusivamente el cambio de formato de reference.
-- ============================================================

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

  -- Referencia única, alfanumérica con guiones (formato aceptado por
  -- Wompi — SolarDesk ya usa guiones en la suya) — nunca reutilizada tras
  -- un intento fallido: cada intento nuevo (tras declined/voided/error)
  -- crea una fila y una referencia nuevas. `PADEL-` identifica
  -- inequívocamente esta transacción como de Mi Pádel Club dentro del
  -- comercio Wompi compartido con SolarDesk (ver nota de cabecera).
  v_reference := 'PADEL-' || replace(gen_random_uuid()::text, '-', '');

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
