-- ============================================================
-- Funnel Comercial v1 — commercial_leads
-- Mi Pádel Club
-- ============================================================
-- Captación → Lead → gestión comercial mínima (SUPERADMIN, /platform/leads)
-- → conversión, reutilizando el mecanismo de Entrega de Club ya existente
-- (platform_create_pending_club, ver 20261005000001) — nunca un segundo
-- onboarding, nunca otro modelo de OWNER temporal, nunca otro flujo de
-- claim. Esta migración solo agrega captación de leads + su gestión +
-- un puente atómico hacia ese flujo intacto.
--
-- Explícitamente fuera de alcance aquí (fase posterior): Wompi, cobros,
-- suscripciones, trial comercial, bloqueo de reservas/torneos por plan.
--
-- Hardening de search_path: las 6 funciones SECURITY DEFINER de esta
-- migración usan `SET search_path = ''` (vacío) en vez de `SET search_path
-- = public` — el patrón preexistente en el resto del repo, pero uno que
-- sigue siendo atacable si algún día alguien crea un objeto malicioso con
-- el mismo nombre en un schema que el caller controle y que preceda a
-- `public` en su propio search_path de sesión. Con search_path='' no hay
-- ningún schema implícito que resolver (pg_catalog se sigue buscando
-- siempre, sea cual sea el valor de search_path — ver documentación de
-- Postgres — por lo que funciones built-in como length/left/trim/now/
-- coalesce/nullif/regexp_replace siguen resolviendo sin problema); toda
-- referencia a una tabla o función propia debe ir calificada con
-- `public.` explícitamente. Verificado antes de aplicar: cada FROM/JOIN/
-- UPDATE/INSERT/llamada a función de estas 6 funciones ya usaba `public.`
-- explícito incluso antes de este cambio, así que no depende de ninguna
-- resolución implícita. Esto NO toca ninguna función preexistente fuera de
-- esta migración (todas las demás del repo siguen en `SET search_path =
-- public`, sin cambios).
-- ============================================================

-- ─── commercial_leads ──────────────────────────────────────────────────────

CREATE TABLE public.commercial_leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name       text NOT NULL CHECK (length(contact_name) BETWEEN 1 AND 150),
  club_name          text NOT NULL CHECK (length(club_name) BETWEEN 1 AND 150),
  city               text NOT NULL CHECK (length(city) BETWEEN 1 AND 100),
  -- Mismo formato normalizado que profiles.phone en el resto del producto
  -- (shared/utils/phone.ts: solo dígitos, código de país incluido cuando el
  -- usuario lo escribió, sin "+"). El CHECK espeja los límites MIN_DIGITS/
  -- MAX_DIGITS (8-15) de esa misma utilidad — defensa en profundidad, la
  -- normalización real ocurre en create_commercial_lead/el Server Action.
  whatsapp           text NOT NULL CHECK (whatsapp ~ '^\d{8,15}$'),
  number_of_courts   integer CHECK (number_of_courts IS NULL OR (number_of_courts BETWEEN 1 AND 100)),
  -- 'website' es el único valor que el formulario público /demo puede
  -- producir hoy (forzado server-side, nunca confiado del cliente) — el
  -- resto queda listo para atribución manual/futuras campañas, sin
  -- construir attribution real todavía.
  source             text NOT NULL DEFAULT 'website'
                        CHECK (source IN ('website', 'instagram', 'facebook', 'referral', 'manual', 'other')),
  -- V1 deliberadamente simple — no es un CRM. Ver CLAUDE.md § Funnel
  -- Comercial para la razón de no agregar qualified/proposal/trial/etc.
  status             text NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'contacted', 'demo_scheduled', 'demo_completed', 'won', 'lost')),
  notes              text CHECK (notes IS NULL OR length(notes) <= 4000),
  lost_reason        text CHECK (lost_reason IS NULL OR length(lost_reason) <= 500),
  demo_at            timestamptz,
  -- Nunca ON DELETE CASCADE — un club nunca se borra físicamente durante
  -- el MVP (ver Club Archival Principles), pero si alguna vez lo fuera,
  -- el historial comercial del lead debe preservarse, no desaparecer.
  converted_club_id  uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  privacy_consent_at timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  converted_at       timestamptz
);

CREATE INDEX commercial_leads_status_idx ON public.commercial_leads (status);
CREATE INDEX commercial_leads_created_at_idx ON public.commercial_leads (created_at DESC);
-- A lo sumo un lead puede reclamar la conversión de un club dado.
CREATE UNIQUE INDEX commercial_leads_converted_club_id_idx
  ON public.commercial_leads (converted_club_id) WHERE converted_club_id IS NOT NULL;

CREATE TRIGGER set_commercial_leads_updated_at
  BEFORE UPDATE ON public.commercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: completamente cerrada a todo rol de cliente, mismo patrón que
-- club_claim_links/club_claim_events (20261003000001) — ninguna policy,
-- todo acceso pasa por las funciones SECURITY DEFINER de abajo. Esto evita
-- por construcción la clase de bug ya vivida en este proyecto (una policy
-- SUPERADMIN sin `TO authenticated` evaluándose también para `anon`): aquí
-- no hay ninguna policy que pueda tener ese defecto.
ALTER TABLE public.commercial_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_leads FROM PUBLIC, anon, authenticated;

-- ─── create_commercial_lead — creación pública, superficie mínima ─────────
-- anon/authenticated pueden ejecutar esto, pero la firma de la función no
-- acepta status/source/notes/converted_club_id como parámetros — no es que
-- se "ignoren" valores del cliente, es que no existe ningún parámetro por
-- el que un caller pudiera intentar declararse won/lost/converted o
-- inyectar notas internas. status='new', source='website' y
-- converted_club_id=NULL están hardcodeados en el INSERT.
CREATE OR REPLACE FUNCTION public.create_commercial_lead(
  p_contact_name     text,
  p_club_name        text,
  p_city             text,
  p_whatsapp         text,
  p_number_of_courts integer DEFAULT NULL,
  p_privacy_consent  boolean DEFAULT false,
  -- Honeypot anti-spam de bajo costo: un visitante real nunca ve ni llena
  -- este campo (oculto visualmente en el formulario). Si llega no-vacío,
  -- se responde éxito sin escribir fila, para no darle señal a un bot.
  p_honeypot         text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_contact_name text := NULLIF(TRIM(p_contact_name), '');
  v_club_name    text := NULLIF(TRIM(p_club_name), '');
  v_city         text := NULLIF(TRIM(p_city), '');
  v_whatsapp     text := regexp_replace(COALESCE(p_whatsapp, ''), '[^0-9]', '', 'g');
BEGIN
  IF p_honeypot IS NOT NULL AND length(TRIM(p_honeypot)) > 0 THEN
    RETURN true;
  END IF;

  IF NOT p_privacy_consent THEN
    RAISE EXCEPTION 'Privacy consent is required' USING ERRCODE = '23514';
  END IF;

  IF v_contact_name IS NULL OR v_club_name IS NULL OR v_city IS NULL THEN
    RAISE EXCEPTION 'Missing required fields' USING ERRCODE = '23502';
  END IF;

  IF v_whatsapp !~ '^\d{8,15}$' THEN
    RAISE EXCEPTION 'Invalid WhatsApp number' USING ERRCODE = '23514';
  END IF;

  IF p_number_of_courts IS NOT NULL AND (p_number_of_courts < 1 OR p_number_of_courts > 100) THEN
    RAISE EXCEPTION 'Invalid number of courts' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.commercial_leads (
    contact_name, club_name, city, whatsapp, number_of_courts,
    source, status, privacy_consent_at
  ) VALUES (
    left(v_contact_name, 150), left(v_club_name, 150), left(v_city, 100), v_whatsapp,
    p_number_of_courts, 'website', 'new', now()
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_commercial_lead(text, text, text, text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_commercial_lead(text, text, text, text, integer, boolean, text) TO anon, authenticated;

-- ─── get_platform_leads_overview — /platform/leads listado ────────────────
CREATE FUNCTION public.get_platform_leads_overview()
RETURNS TABLE (
  id                uuid,
  contact_name      text,
  club_name         text,
  city              text,
  whatsapp          text,
  number_of_courts  integer,
  status            text,
  demo_at           timestamptz,
  created_at        timestamptz,
  converted_club_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT
    cl.id, cl.contact_name, cl.club_name, cl.city, cl.whatsapp,
    cl.number_of_courts, cl.status, cl.demo_at, cl.created_at, cl.converted_club_id
  FROM public.commercial_leads cl
  WHERE EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  )
  ORDER BY cl.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_platform_leads_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_leads_overview() TO authenticated;

-- ─── get_platform_lead_detail — /platform/leads/[leadId] ──────────────────
CREATE FUNCTION public.get_platform_lead_detail(p_lead_id uuid)
RETURNS TABLE (
  id                  uuid,
  contact_name        text,
  club_name           text,
  city                text,
  whatsapp            text,
  number_of_courts    integer,
  source              text,
  status              text,
  notes               text,
  lost_reason         text,
  demo_at             timestamptz,
  converted_club_id   uuid,
  converted_club_name text,
  converted_club_slug text,
  privacy_consent_at  timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz,
  converted_at        timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT
    cl.id, cl.contact_name, cl.club_name, cl.city, cl.whatsapp,
    cl.number_of_courts, cl.source, cl.status, cl.notes, cl.lost_reason,
    cl.demo_at, cl.converted_club_id, c.name, c.slug,
    cl.privacy_consent_at, cl.created_at, cl.updated_at, cl.converted_at
  FROM public.commercial_leads cl
  LEFT JOIN public.clubs c ON c.id = cl.converted_club_id
  WHERE cl.id = p_lead_id
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.is_platform_admin = true
    );
$$;

REVOKE ALL ON FUNCTION public.get_platform_lead_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_lead_detail(uuid) TO authenticated;

-- ─── update_commercial_lead_status — cambio de estado, SUPERADMIN-only ────
-- demo_at y lost_reason nunca se borran automáticamente al salir de
-- demo_scheduled/lost — solo se sobrescriben cuando el caller manda un
-- valor nuevo no vacío, preservando historia por defecto (ver CLAUDE.md).
CREATE OR REPLACE FUNCTION public.update_commercial_lead_status(
  p_lead_id    uuid,
  p_status     text,
  p_demo_at    timestamptz DEFAULT NULL,
  p_lost_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('new', 'contacted', 'demo_scheduled', 'demo_completed', 'won', 'lost') THEN
    RAISE EXCEPTION 'Invalid status value' USING ERRCODE = '22023';
  END IF;

  UPDATE public.commercial_leads AS cl
  SET status      = p_status,
      demo_at     = COALESCE(p_demo_at, cl.demo_at),
      lost_reason = CASE
                      WHEN p_status = 'lost' THEN COALESCE(NULLIF(TRIM(p_lost_reason), ''), cl.lost_reason)
                      ELSE cl.lost_reason
                    END,
      updated_at  = now()
  WHERE cl.id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_commercial_lead_status(uuid, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_commercial_lead_status(uuid, text, timestamptz, text) TO authenticated;

-- ─── update_commercial_lead_notes — nota interna, SUPERADMIN-only ─────────
CREATE OR REPLACE FUNCTION public.update_commercial_lead_notes(
  p_lead_id uuid,
  p_notes   text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.commercial_leads AS cl
  SET notes      = NULLIF(TRIM(p_notes), ''),
      updated_at = now()
  WHERE cl.id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_commercial_lead_notes(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_commercial_lead_notes(uuid, text) TO authenticated;

-- ─── platform_convert_lead_to_pending_club — puente atómico hacia Entrega ─
-- de Club. Reutiliza platform_create_pending_club (20261005000001) tal
-- cual — llamándolo, nunca reimplementando su lógica — y en la MISMA
-- invocación de función (misma transacción del caller) marca el lead como
-- convertido. Si cualquiera de los dos pasos falla, ambos se revierten
-- juntos: nunca puede quedar un club creado con un lead sin convertir.
--
-- Bloquea la fila del lead con FOR UPDATE antes de tocar nada, para que
-- dos conversiones concurrentes del mismo lead no puedan interleavearse
-- y crear dos clubes. Todas las columnas de salida (id, slug) y todas las
-- tablas se referencian con alias explícitos — nunca una columna
-- desambiguada solo por convención, ver CLAUDE.md § convenciones SQL sobre
-- el bug de columnas ambiguas en funciones RETURNS TABLE.
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT cl.converted_club_id INTO v_existing_club_id
  FROM public.commercial_leads AS cl
  WHERE cl.id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing_club_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_converted: this lead has already been converted to a club' USING ERRCODE = '23514';
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
