-- ============================================================
-- Funnel Comercial v1 — conversión solo desde "Demo realizada"
-- Mi Pádel Club
-- ============================================================
-- QA real en producción detectó que la UI permitía saltarse el flujo
-- comercial (mostraba "Crear club" incluso en new/contacted/
-- demo_scheduled), y que platform_convert_lead_to_pending_club
-- (20261115000001) no tenía ninguna validación server-side equivalente —
-- solo rechazaba un lead YA convertido (converted_club_id IS NOT NULL),
-- nunca uno todavía sin demo realizada. Esta migración reemplaza
-- ÚNICAMENTE esa función para cerrar el bypass server-side; la UI se
-- corrigió en LeadDetail.tsx en el mismo cambio.
--
-- No se reimplementa la conversión: sigue reutilizando
-- platform_create_pending_club(...) tal cual, dentro del mismo bloqueo
-- FOR UPDATE, misma atomicidad (una sola invocación de función = una sola
-- transacción del caller), misma idempotencia (un lead ya convertido
-- sigue rechazándose exactamente igual que antes), mismos efectos
-- (converted_club_id, converted_at, status='won') y mismos controles
-- SUPERADMIN. Deliberadamente NO se exige que el lead haya pasado antes
-- por 'won' — demo_completed es la única precondición: la creación del
-- club es precisamente lo que lo convierte en Ganado.
--
-- Mantiene el mismo hardening que 20261115000001: SECURITY DEFINER,
-- SET search_path = '' (vacío), toda tabla/función propia calificada con
-- `public.`, mismos GRANT/REVOKE. No se toca ninguna otra función de esa
-- migración ni de ninguna otra.
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_convert_lead_to_pending_club(
  p_lead_id    uuid,
  p_name       text,
  p_slug       text,
  p_visibility text DEFAULT 'private'
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_club_id          uuid;
  v_club_slug        text;
  v_existing_club_id uuid;
  v_status           text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT cl.converted_club_id, cl.status INTO v_existing_club_id, v_status
  FROM public.commercial_leads AS cl
  WHERE cl.id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing_club_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_converted: this lead has already been converted to a club' USING ERRCODE = '23514';
  END IF;

  -- Único requisito de estado: demo_completed. No se exige 'won' — la
  -- conversión exitosa es lo que lleva el lead a 'won', no al revés.
  IF v_status IS DISTINCT FROM 'demo_completed' THEN
    RAISE EXCEPTION 'not_demo_completed: lead must be in demo_completed status before conversion' USING ERRCODE = '23514';
  END IF;

  SELECT t.id, t.slug INTO v_club_id, v_club_slug
  FROM public.platform_create_pending_club(p_name, p_slug, p_visibility) AS t;

  UPDATE public.commercial_leads AS cl
  SET converted_club_id = v_club_id,
      converted_at      = now(),
      status            = 'won',
      updated_at        = now()
  WHERE cl.id = p_lead_id;

  RETURN QUERY SELECT v_club_id, v_club_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_convert_lead_to_pending_club(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_convert_lead_to_pending_club(uuid, text, text, text) TO authenticated;
