-- ============================================================
-- Fase 1 módulo deportivo — hotfix integral de autorización deportiva.
--
-- Vulnerabilidad confirmada por ejecución real (get_club_member_sport_state):
-- un usuario autenticado sin ninguna fila (activa ni inactiva) en
-- club_members de un club dado podía leer el estado deportivo real de
-- cualquier club_member_id de ese club, sin ningún error de autorización.
--
-- Causa raíz, compartida por CUATRO funciones deportivas vivas:
--   v_role := public.club_role(p_club_id)
-- devuelve NULL cuando el caller no tiene membresía activa en ese club. El
-- patrón
--   IF v_role NOT IN ('OWNER', 'ADMIN') THEN RAISE EXCEPTION ... END IF;
-- evalúa `NULL NOT IN (...)` como NULL, no como TRUE. En plpgsql, un IF
-- cuya condición es NULL se trata como falso: el bloque completo de
-- autorización se omite en silencio y la ejecución continúa. En
-- get_club_member_sport_state esto exponía una lectura no autorizada; en
-- adjust_club_player_points, change_club_player_category y
-- configure_club_default_player_category el mismo patrón permitía llegar
-- sin autorización hasta escrituras reales (ajuste de puntos, cambio de
-- categoría, configuración del club y aprovisionamiento).
--
-- Corrección, idéntica en las cuatro funciones: autorización explícita y
-- positiva, sin ninguna rama implícita. Ya no se depende únicamente de
-- club_role() — se consulta club_members directamente para obtener la
-- membresía ACTIVA real del caller en el club (club_id = p_club_id,
-- profile_id = auth.uid(), is_active = true). Sin membresía activa →
-- 42501 explícito. Con membresía activa, el rol se compara de forma
-- positiva (IN ('OWNER', 'ADMIN'), nunca NOT IN sobre un valor que pueda
-- ser NULL); get_club_member_sport_state además permite el caso adicional
-- de un PLAYER activo leyendo únicamente su propio club_member_id.
-- Cualquier otro caso cae en un ELSE final que también rechaza
-- explícitamente. No existe ningún punto donde un valor NULL o inesperado
-- permita continuar.
--
-- change_club_player_category recibe además una segunda corrección,
-- independiente de la de autorización: su validación de p_change_type
-- carecía de guarda explícita contra NULL (`p_change_type NOT IN (...)`
-- sin `IS NULL OR` delante), el mismo patrón NOT-IN-sobre-NULL aplicado a
-- un parámetro en vez de a un rol. Corregido con
-- `p_change_type IS NULL OR p_change_type NOT IN (...)`.
--
-- Se reemplazan exclusivamente estas cuatro funciones. No se toca
-- get_club_category_ranking, get_club_category_ranking_view, ni ninguna
-- otra RPC, tabla, trigger, RLS o dato. No se modifica ninguna migración
-- ya aplicada (20260818000001 a 20260824000001) — esta es una migración
-- nueva, todavía sin aplicar. Ningún DROP FUNCTION, ningún CASCADE.
-- ============================================================


-- ─── 1. get_club_member_sport_state ──────────────────────────────────────────
-- Corrección ya presente en la primera versión de este archivo, conservada
-- sin cambios de comportamiento: auth.uid() obligatorio; membresía activa
-- del caller consultada directamente en club_members (no club_role());
-- OWNER/ADMIN activo lee el estado de cualquier miembro del club; PLAYER
-- activo únicamente el propio (v_caller_member.id = p_club_member_id, ya
-- scoped a p_club_id por el WHERE de la búsqueda de membresía); cualquier
-- otro caso, 42501 explícito. Firma, RETURNS TABLE, STABLE, SECURITY
-- DEFINER, search_path y permisos sin cambios.
CREATE OR REPLACE FUNCTION public.get_club_member_sport_state(
  p_club_id        uuid,
  p_club_member_id uuid
)
RETURNS TABLE (
  club_member_id    uuid,
  category          text,
  current_points    integer,
  points_reached_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Membresía ACTIVA real del caller en este club, consultada
  -- directamente — no se depende únicamente de club_role(). Alias
  -- explícito (cm) sobre todas las columnas reales.
  SELECT *
  INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to read sport state for this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    -- OWNER/ADMIN activo de este club: puede leer el estado de
    -- cualquier miembro, comportamiento ya existente y sin cambios.
    NULL;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    -- PLAYER activo: únicamente su propio club_member_id, en este
    -- mismo club (v_caller_member ya está scoped a p_club_id).
    IF v_caller_member.id <> p_club_member_id THEN
      RAISE EXCEPTION 'Not authorized to read sport state for this club' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Cualquier otro caso (rol inesperado, futuro rol no contemplado):
    -- rechazo explícito, nunca una rama implícita que continúe.
    RAISE EXCEPTION 'Not authorized to read sport state for this club' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.club_member_id, c.category, s.current_points, s.points_reached_at
  FROM public.club_member_sport_state s
  JOIN public.club_ranking_cycles c ON c.id = s.cycle_id
  JOIN public.club_members cm ON cm.id = s.club_member_id
  WHERE s.club_member_id = p_club_member_id
    AND cm.club_id = p_club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_member_sport_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_member_sport_state(uuid, uuid) TO authenticated;


-- ─── 2. adjust_club_player_points ────────────────────────────────────────────
-- Definición viva copiada íntegra desde 20260823000001 (el hotfix de
-- ambigüedades 42702, la más reciente que la toca). Único cambio real:
-- el bloque de autorización — v_role/club_role()/NOT IN reemplazado por
-- una membresía activa consultada directamente y una comparación positiva
-- (IN). Todo lo demás — validaciones de negocio, FOR UPDATE, aliases del
-- hotfix, catálogo de reason_code, piso en cero, rechazo del ajuste
-- efectivo cero, ledger, created_by, origin/adjustment_mode — sin ningún
-- cambio de lógica ni de mensaje.
CREATE OR REPLACE FUNCTION public.adjust_club_player_points(
  p_club_id        uuid,
  p_club_member_id uuid,
  p_delta_points   integer,
  p_reason_code    text,
  p_note           text
)
RETURNS TABLE (
  club_member_id uuid,
  category       text,
  previous_total integer,
  delta          integer,
  new_total      integer,
  movement_id    uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_member      public.club_members%ROWTYPE;
  v_state       public.club_member_sport_state%ROWTYPE;
  v_category    text;
  v_new_total   integer;
  v_movement_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Membresía ACTIVA real del caller en este club, consultada
  -- directamente — no se depende únicamente de club_role(). Alias
  -- explícito (cm) sobre todas las columnas reales.
  SELECT *
  INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to adjust points in this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to adjust points in this club' USING ERRCODE = '42501';
  END IF;

  IF p_delta_points = 0 THEN
    RAISE EXCEPTION 'delta_points cannot be zero' USING ERRCODE = '22023';
  END IF;

  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'internal_league', 'coach_clinic', 'no_show_penalty',
    'club_representation_bonus', 'special_event', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid reason_code' USING ERRCODE = '22023';
  END IF;

  IF p_note IS NULL OR length(btrim(p_note)) = 0 OR length(btrim(p_note)) > 500 THEN
    RAISE EXCEPTION 'note must be between 1 and 500 characters' USING ERRCODE = '22023';
  END IF;

  -- Qualified defensively (cm.id/cm.club_id) even though neither currently
  -- collides with a RETURNS TABLE column — matches the same alias
  -- discipline applied everywhere else in this fix.
  SELECT * INTO v_member
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_id AND cm.club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found in this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_member.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can be adjusted' USING ERRCODE = '42501';
  END IF;

  IF v_member.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot adjust an inactive membership' USING ERRCODE = '42501';
  END IF;

  -- s.club_member_id — bare club_member_id would collide with this
  -- function's own RETURNS TABLE output column of the same name.
  SELECT * INTO v_state
  FROM public.club_member_sport_state AS s
  WHERE s.club_member_id = p_club_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This player has no sport state yet' USING ERRCODE = 'P0002';
  END IF;

  -- Defense in depth: v_member.club_id already equals p_club_id by the
  -- WHERE clause above, but the state row's own club_id is cross-checked
  -- independently too, same "don't trust a single path" posture used
  -- throughout this project.
  IF v_state.club_id <> p_club_id THEN
    RAISE EXCEPTION 'Sport state does not belong to this club' USING ERRCODE = '42501';
  END IF;

  -- c.category — bare category would collide with this function's own
  -- RETURNS TABLE output column of the same name (club_ranking_cycles also
  -- has a real column called category).
  SELECT c.category INTO v_category
  FROM public.club_ranking_cycles AS c WHERE c.id = v_state.cycle_id;

  -- Floor at zero — never rejected, per the already-frozen rule. delta
  -- stored below is always the EFFECTIVE change (new_total - previous_total),
  -- which already equals the floored result even when p_delta_points would
  -- have gone negative.
  v_new_total := GREATEST(v_state.current_points + p_delta_points, 0);

  -- The zero floor can fully absorb a negative delta (e.g. current_points
  -- = 0, p_delta_points = -5 → floored result is still 0) — the requested
  -- delta was non-zero, but the EFFECTIVE change would be none at all.
  -- Rejected outright, before touching any table: no state update, no
  -- points_reached_at change, no ledger row. This is the only way
  -- v_new_total can ever equal v_state.current_points here, since
  -- p_delta_points = 0 was already rejected above — so once past this
  -- point, v_new_total <> v_state.current_points is guaranteed.
  IF v_new_total = v_state.current_points THEN
    RAISE EXCEPTION 'Adjustment results in no change to current points' USING ERRCODE = '22023';
  END IF;

  -- s.club_member_id in WHERE — SET target column names (current_points,
  -- points_reached_at) cannot be qualified in Postgres (SET col = val is the
  -- only valid form), so those remain bare; that was never ambiguous since
  -- neither name is a RETURNS TABLE column of this function.
  UPDATE public.club_member_sport_state AS s
  SET current_points = v_new_total,
      points_reached_at = now()
  WHERE s.club_member_id = p_club_member_id;

  -- INSERT column lists always resolve to the target table's own columns
  -- regardless of outer scope — never ambiguous with a plpgsql variable —
  -- so this was never affected by the bug and is unchanged.
  INSERT INTO public.club_player_point_movements (
    club_id, club_member_id, cycle_id, category,
    previous_total, new_total, delta,
    adjustment_mode, origin, reason_code, comment, created_by
  ) VALUES (
    p_club_id, p_club_member_id, v_state.cycle_id, v_category,
    v_state.current_points, v_new_total, (v_new_total - v_state.current_points),
    'delta', 'manual', p_reason_code, p_note, auth.uid()
  )
  RETURNING id INTO v_movement_id;

  RETURN QUERY SELECT
    p_club_member_id, v_category, v_state.current_points,
    (v_new_total - v_state.current_points), v_new_total, v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_club_player_points(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_club_player_points(uuid, uuid, integer, text, text) TO authenticated;


-- ─── 3. change_club_player_category ──────────────────────────────────────────
-- Definición viva copiada íntegra desde 20260823000001. Dos cambios
-- reales: (a) el bloque de autorización, misma corrección que arriba; (b)
-- la validación de p_change_type, que ahora rechaza explícitamente NULL
-- antes del NOT IN (el propio NOT IN ya era seguro una vez agregada la
-- guarda, porque queda precedido por IS NULL). No se toca
-- get_club_category_ranking (todavía invocada aquí sin cambios) ni
-- get_club_category_ranking_view.
CREATE OR REPLACE FUNCTION public.change_club_player_category(
  p_club_id         uuid,
  p_club_member_id  uuid,
  p_target_category text,
  p_change_type     text,
  p_note            text
)
RETURNS TABLE (
  club_member_id      uuid,
  previous_category   text,
  new_category        text,
  previous_points     integer,
  new_points          integer,
  previous_cycle_id   uuid,
  new_cycle_id        uuid,
  category_change_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member      public.club_members%ROWTYPE;
  v_member             public.club_members%ROWTYPE;
  v_state              public.club_member_sport_state%ROWTYPE;
  v_previous_category  text;
  v_previous_sort      smallint;
  v_target_sort        smallint;
  v_previous_position  bigint;
  v_new_cycle_id       uuid;
  v_category_change_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Membresía ACTIVA real del caller en este club, consultada
  -- directamente — no se depende únicamente de club_role(). Alias
  -- explícito (cm) sobre todas las columnas reales.
  SELECT *
  INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to change category in this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to change category in this club' USING ERRCODE = '42501';
  END IF;

  -- p_change_type ahora rechaza NULL explícitamente antes del NOT IN — el
  -- NOT IN queda seguro porque siempre está precedido por IS NULL.
  IF p_change_type IS NULL
     OR p_change_type NOT IN ('promotion', 'demotion', 'correction')
  THEN
    RAISE EXCEPTION 'Invalid change_type' USING ERRCODE = '22023';
  END IF;

  IF p_note IS NULL OR length(btrim(p_note)) = 0 OR length(btrim(p_note)) > 500 THEN
    RAISE EXCEPTION 'note must be between 1 and 500 characters' USING ERRCODE = '22023';
  END IF;

  -- sort_order/code never collide with any parameter, local variable or
  -- RETURNS TABLE column of this function — left as-is, no ambiguity found.
  SELECT sort_order INTO v_target_sort
  FROM public.sport_categories WHERE code = p_target_category;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid target category' USING ERRCODE = '22023';
  END IF;

  -- Qualified defensively (cm.id/cm.club_id), same discipline as above.
  SELECT * INTO v_member
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_id AND cm.club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found in this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_member.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can change category' USING ERRCODE = '42501';
  END IF;

  IF v_member.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot change category of an inactive membership' USING ERRCODE = '42501';
  END IF;

  -- s.club_member_id — bare club_member_id would collide with this
  -- function's own RETURNS TABLE output column of the same name.
  SELECT * INTO v_state
  FROM public.club_member_sport_state AS s
  WHERE s.club_member_id = p_club_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This player has no sport state yet' USING ERRCODE = 'P0002';
  END IF;

  IF v_state.club_id <> p_club_id THEN
    RAISE EXCEPTION 'Sport state does not belong to this club' USING ERRCODE = '42501';
  END IF;

  -- Already fully qualified (c.category, sc.sort_order, c.id) in the
  -- original — no ambiguity here, unchanged.
  SELECT c.category, sc.sort_order INTO v_previous_category, v_previous_sort
  FROM public.club_ranking_cycles c
  JOIN public.sport_categories sc ON sc.code = c.category
  WHERE c.id = v_state.cycle_id;

  -- Explicit error, not a silent no-op — a silent success with nothing
  -- actually changed would leave the UI unable to tell the admin what
  -- happened, per the controlled-no-op requirement.
  IF p_target_category = v_previous_category THEN
    RAISE EXCEPTION 'Target category is the same as the current category' USING ERRCODE = '22023';
  END IF;

  IF p_change_type = 'promotion' AND v_target_sort <= v_previous_sort THEN
    RAISE EXCEPTION 'promotion requires a higher category order than the current one' USING ERRCODE = '22023';
  END IF;

  IF p_change_type = 'demotion' AND v_target_sort >= v_previous_sort THEN
    RAISE EXCEPTION 'demotion requires a lower category order than the current one' USING ERRCODE = '22023';
  END IF;

  -- r.club_member_id — get_club_category_ranking's own result column
  -- club_member_id, read here with an explicit alias, would otherwise
  -- collide with THIS function's own RETURNS TABLE output column of the
  -- same name. get_club_category_ranking itself is called unmodified.
  SELECT r.ranking_position INTO v_previous_position
  FROM public.get_club_category_ranking(p_club_id, v_previous_category) AS r
  WHERE r.club_member_id = p_club_member_id;

  v_new_cycle_id := public.get_or_create_active_ranking_cycle(p_club_id, p_target_category);

  -- INSERT column lists always resolve to the target table's own columns —
  -- never ambiguous with a plpgsql variable — unchanged.
  INSERT INTO public.club_player_category_changes (
    club_id, club_member_id, previous_cycle_id, new_cycle_id,
    previous_category, new_category, previous_points, previous_position,
    change_type, comment, created_by
  ) VALUES (
    p_club_id, p_club_member_id, v_state.cycle_id, v_new_cycle_id,
    v_previous_category, p_target_category, v_state.current_points, v_previous_position,
    p_change_type, p_note, auth.uid()
  )
  RETURNING id INTO v_category_change_id;

  -- Technical reset movement — closes the OLD cycle's ledger at its true
  -- final balance. cycle_id/category here are deliberately the PREVIOUS
  -- ones (the cycle being left), never the new one — the new cycle starts
  -- with zero movements, exactly like backfill/provisioning. reason_code
  -- is NULL (the 6-value manual catalog never applies to a system event);
  -- comment is exactly the same text just stored on the category_changes
  -- row above, not a second, independently-typed comment. Same "INSERT
  -- column lists are never ambiguous" reasoning as above — unchanged.
  INSERT INTO public.club_player_point_movements (
    club_id, club_member_id, cycle_id, category,
    previous_total, new_total, delta,
    adjustment_mode, origin, system_event_code, reason_code, comment,
    category_change_id, created_by
  ) VALUES (
    p_club_id, p_club_member_id, v_state.cycle_id, v_previous_category,
    v_state.current_points, 0, (0 - v_state.current_points),
    'set', 'system', 'category_change', NULL, p_note,
    v_category_change_id, auth.uid()
  );

  -- s.club_member_id in WHERE — SET target columns (cycle_id,
  -- current_points, points_reached_at) remain bare, same Postgres syntax
  -- constraint as above; none of them were ever ambiguous.
  UPDATE public.club_member_sport_state AS s
  SET cycle_id = v_new_cycle_id,
      current_points = 0,
      points_reached_at = now()
  WHERE s.club_member_id = p_club_member_id;

  RETURN QUERY SELECT
    p_club_member_id, v_previous_category, p_target_category,
    v_state.current_points, 0, v_state.cycle_id, v_new_cycle_id, v_category_change_id;
END;
$$;

REVOKE ALL ON FUNCTION public.change_club_player_category(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_club_player_category(uuid, uuid, text, text, text) TO authenticated;


-- ─── 4. configure_club_default_player_category ───────────────────────────────
-- Definición viva copiada íntegra desde 20260821000001 (nunca reemplazada
-- desde entonces). Único cambio real: el bloque de autorización, misma
-- corrección que las anteriores. Validación del catálogo, UPDATE de
-- clubs.default_player_category, y la llamada a
-- provision_club_sport_members (idempotencia, ON CONFLICT DO NOTHING) sin
-- ningún cambio.
CREATE OR REPLACE FUNCTION public.configure_club_default_player_category(
  p_club_id  uuid,
  p_category text
)
RETURNS TABLE (category text, cycle_id uuid, provisioned_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_cycle_id    uuid;
  v_provisioned integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Membresía ACTIVA real del caller en este club, consultada
  -- directamente — no se depende únicamente de club_role(). Alias
  -- explícito (cm) sobre todas las columnas reales.
  SELECT *
  INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to configure this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to configure this club' USING ERRCODE = '42501';
  END IF;

  -- Re-checked here too (not only inside get_or_create_active_ranking_cycle
  -- below) — same "cross-check, don't trust a single path" posture already
  -- established in this codebase (20260809000001) — so an invalid category
  -- is rejected before clubs.default_player_category is ever written, not
  -- after.
  IF NOT EXISTS (SELECT 1 FROM public.sport_categories WHERE code = p_category) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clubs SET default_player_category = p_category WHERE id = p_club_id;

  SELECT p.cycle_id, p.provisioned_count INTO v_cycle_id, v_provisioned
  FROM public.provision_club_sport_members(p_club_id) p;

  RETURN QUERY SELECT p_category, v_cycle_id, v_provisioned;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_club_default_player_category(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_club_default_player_category(uuid, text) TO authenticated;
