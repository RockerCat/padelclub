-- ============================================================
-- Tournament admin lifecycle — create/update/open/close/cancel
-- (Bloque 1.5, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Cinco funciones SECURITY DEFINER sobre public.tournaments únicamente.
-- Ninguna toca tournament_court_allocations, tournament_entries,
-- tournament_entry_members, tournament_matches ni el ledger de puntos.
--
-- Autorización: patrón ya corregido y vigente del módulo deportivo
-- (20260825000001_fix_sport_state_authorization_bypass) — NUNCA
-- club_role() + NOT IN (ese patrón evalúa NULL cuando el caller no es
-- miembro, y `IF NULL THEN` se trata como falso en plpgsql, dejando
-- pasar en silencio; fue exactamente la vulnerabilidad real ya
-- corregida en ese módulo). Aquí: membresía ACTIVA consultada
-- directamente en club_members, `IF NOT FOUND` explícito, y luego una
-- comparación POSITIVA (`role IN ('OWNER','ADMIN')`), nunca NOT IN sobre
-- un valor que pueda ser NULL.
--
-- Todas las funciones devuelven RETURNS TABLE con las 20 columnas reales
-- de tournaments, en su orden real — no existe precedente en el
-- repositorio de `RETURNS public.<tabla>` como tipo fila compuesto
-- (todas las funciones existentes que devuelven filas usan RETURNS
-- TABLE), así que se sigue esa única convención real. Por la misma
-- razón, cada consulta interna alias explícitamente sus tablas
-- (`AS t`, `AS cm`, `AS sc`) — varias de esas 20 columnas (`id`,
-- `club_id`, `name`, `category`, `status`, ...) son nombres muy
-- comunes que colisionarían en silencio con las propias columnas de
-- salida de RETURNS TABLE si se referenciaran sin calificar, el mismo
-- riesgo estructural que motivó el hotfix de autorización citado
-- arriba, aplicado aquí de forma preventiva.
--
-- _require_club_not_archived (20260815000001) se reutiliza tal cual, en
-- las funciones que crean un nuevo compromiso (create/update/open) —
-- nunca en close/cancel, que solo resuelven algo ya existente, mismo
-- criterio ya aplicado a cancel_reservation/reject_pending_reservation
-- en ese mismo módulo.
--
-- Concurrencia: SELECT ... FOR UPDATE (bloquea la fila desde la primera
-- lectura) + UPDATE condicionado por el estado esperado + GET
-- DIAGNOSTICS ROW_COUNT — mismo patrón exacto de archive_club
-- (20260815000001) y update_reservation/approve_pending_reservation
-- (20260814000001/20260815000001). Sin advisory locks: no aplica aquí,
-- son propios de choques de rango horario, no de esta transición de
-- estado de una sola fila.
--
-- Sin GRANT a authenticated en esta iteración (instrucción explícita) —
-- las cinco funciones existen y son correctas, pero ningún rol de
-- cliente puede invocarlas todavía; eso queda para cuando se autorice
-- exponerlas.
-- ============================================================


-- ─── create_tournament ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tournament(
  p_club_id                 uuid,
  p_name                    text,
  p_category                text,
  p_bracket_size            integer,
  p_description             text DEFAULT NULL,
  p_visibility              text DEFAULT 'private',
  p_registration_opens_at   timestamptz DEFAULT NULL,
  p_registration_closes_at  timestamptz DEFAULT NULL,
  p_starts_at               timestamptz DEFAULT NULL,
  p_ends_at                 timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_name          text;
  v_description   text;
  v_tournament    public.tournaments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tournament name cannot be blank' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  IF p_bracket_size IS NULL OR p_bracket_size NOT IN (4, 8, 16) THEN
    RAISE EXCEPTION 'Invalid bracket size' USING ERRCODE = '22023';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_starts_at > p_ends_at THEN
    RAISE EXCEPTION 'starts_at must not be after ends_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tournaments (
    club_id, name, description, category, bracket_size, visibility,
    registration_opens_at, registration_closes_at, starts_at, ends_at,
    created_by
  ) VALUES (
    p_club_id, v_name, v_description, p_category, p_bracket_size, p_visibility,
    p_registration_opens_at, p_registration_closes_at, p_starts_at, p_ends_at,
    auth.uid()
  )
  RETURNING * INTO v_tournament;

  RETURN QUERY SELECT (v_tournament).*;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament(
  uuid, text, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz
) FROM PUBLIC;


-- ─── update_tournament ──────────────────────────────────────────────────
-- No recibe status ni ningún actor. draft: todos los campos editables.
-- registration_open: category/bracket_size/registration_opens_at deben
-- llegar exactamente iguales al valor ya guardado — se rechaza
-- explícitamente si difieren, nunca se ignoran en silencio.
CREATE OR REPLACE FUNCTION public.update_tournament(
  p_tournament_id           uuid,
  p_name                    text,
  p_description             text,
  p_category                text,
  p_bracket_size            integer,
  p_visibility              text,
  p_registration_opens_at   timestamptz,
  p_registration_closes_at  timestamptz,
  p_starts_at               timestamptz,
  p_ends_at                 timestamptz
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_name          text;
  v_description   text;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status NOT IN ('draft', 'registration_open') THEN
    RAISE EXCEPTION 'Tournament is not in an editable state' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status = 'registration_open' THEN
    IF p_category IS DISTINCT FROM v_tournament.category THEN
      RAISE EXCEPTION 'category cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
    IF p_bracket_size IS DISTINCT FROM v_tournament.bracket_size THEN
      RAISE EXCEPTION 'bracket_size cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
    IF p_registration_opens_at IS DISTINCT FROM v_tournament.registration_opens_at THEN
      RAISE EXCEPTION 'registration_opens_at cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tournament name cannot be blank' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  IF p_bracket_size IS NULL OR p_bracket_size NOT IN (4, 8, 16) THEN
    RAISE EXCEPTION 'Invalid bracket size' USING ERRCODE = '22023';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_starts_at > p_ends_at THEN
    RAISE EXCEPTION 'starts_at must not be after ends_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET name = v_name,
      description = v_description,
      category = p_category,
      bracket_size = p_bracket_size,
      visibility = p_visibility,
      registration_opens_at = p_registration_opens_at,
      registration_closes_at = p_registration_closes_at,
      starts_at = p_starts_at,
      ends_at = p_ends_at
  WHERE t.id = p_tournament_id AND t.status = v_tournament.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT (v_tournament).*;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, timestamptz
) FROM PUBLIC;


-- ─── open_tournament_registration ───────────────────────────────────────
-- draft → registration_open. Exige configuración temporal completa y
-- registration_opens_at <= now() (el estado debe reflejar que las
-- inscripciones ya están operativamente abiertas, nunca una apertura
-- "programada a futuro" ni automática). Las relaciones de orden entre
-- las cuatro fechas ya están garantizadas por los CHECKs declarativos
-- de tournaments — no se repiten aquí.
CREATE OR REPLACE FUNCTION public.open_tournament_registration(
  p_tournament_id uuid
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to open registration for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to open registration for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft tournament can open registration' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.registration_opens_at IS NULL OR v_tournament.registration_closes_at IS NULL
     OR v_tournament.starts_at IS NULL OR v_tournament.ends_at IS NULL THEN
    RAISE EXCEPTION 'Tournament schedule is not fully configured' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.registration_opens_at > now() THEN
    RAISE EXCEPTION 'registration_opens_at has not arrived yet' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_open'
  WHERE t.id = p_tournament_id AND t.status = 'draft';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament is no longer in draft' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT (v_tournament).*;
END;
$$;

REVOKE ALL ON FUNCTION public.open_tournament_registration(uuid) FROM PUBLIC;


-- ─── close_tournament_registration ──────────────────────────────────────
-- registration_open → registration_closed. Cierre operativo manual, en
-- cualquier momento (incluso antes de registration_closes_at) — la fecha
-- configurada sigue siendo solo la ventana prevista, no una condición
-- de esta transición. No exige todavía bracket_size inscripciones
-- confirmadas (eso pertenece a generate_tournament_bracket). Sin
-- _require_club_not_archived: cerrar es resolver, no crear un
-- compromiso nuevo — mismo criterio que cancel_reservation/
-- reject_pending_reservation.
CREATE OR REPLACE FUNCTION public.close_tournament_registration(
  p_tournament_id uuid
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to close registration for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to close registration for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Only a tournament with open registration can be closed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_closed'
  WHERE t.id = p_tournament_id AND t.status = 'registration_open';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament registration is no longer open' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT (v_tournament).*;
END;
$$;

REVOKE ALL ON FUNCTION public.close_tournament_registration(uuid) FROM PUBLIC;


-- ─── cancel_tournament ───────────────────────────────────────────────────
-- Cancelable únicamente desde draft/registration_open/registration_closed
-- en este bloque. bracket_generated/in_progress quedan deliberadamente
-- fuera: una vez generado el cuadro existen tournament_court_allocations
-- activas que la cancelación debería liberar atómicamente, y esa función
-- de liberación todavía no existe (bloque posterior). Un UPDATE aislado
-- de tournaments.status a 'cancelled' dejaría asignaciones "activas" bajo
-- un torneo ya cancelado — un estado operativo incoherente. Se prefiere
-- la postura conservadora explícita: diferir la cancelación posterior al
-- cuadro a una función transaccional más amplia, en vez de exponer hoy
-- una cancelación parcial. in_progress queda fuera por la misma razón,
-- agravada por la posible existencia de resultados ya registrados. Sin
-- _require_club_not_archived: cancelar resuelve, no crea nada.
CREATE OR REPLACE FUNCTION public.cancel_tournament(
  p_tournament_id uuid
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament    public.tournaments%ROWTYPE;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to cancel this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to cancel this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status NOT IN ('draft', 'registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament cannot be cancelled in its current state' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.status = v_tournament.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT (v_tournament).*;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_tournament(uuid) FROM PUBLIC;
