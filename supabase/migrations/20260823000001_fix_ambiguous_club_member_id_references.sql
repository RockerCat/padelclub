-- ============================================================
-- Fix ambiguous column references — Fase 1 (Módulo deportivo), bloque 5 hotfix
-- Mi Pádel Club
-- ============================================================
-- Production bug found by real execution (SQLSTATE 42702, "column
-- reference \"club_member_id\" is ambiguous") when adjust_club_player_points
-- and change_club_player_category were actually called for the first time.
-- Root cause: a plpgsql function declared with RETURNS TABLE(col1, ...)
-- implicitly declares each output column name as a variable in scope for
-- the entire function body. Both functions have an output column named
-- club_member_id, and both bodies also contained UNQUALIFIED references to
-- club_member_id — a real table column on club_member_sport_state and on
-- get_club_category_ranking's own result set — which Postgres correctly
-- refused to resolve rather than guess.
--
-- Full audit of both function bodies (not just the 3 originally-reported
-- failures) found two additional genuine ambiguities beyond club_member_id:
--   - adjust_club_player_points also has an output column named `category`,
--     which collided with an unqualified `SELECT category ...` against
--     club_ranking_cycles (a real column there too).
--   - change_club_player_category's lookup of the player's previous
--     ranking position queried get_club_category_ranking(...) — itself
--     returning a column also named club_member_id — with no alias.
-- Every other output column of both functions (previous_total, delta,
-- new_total, previous_category, new_category, previous_points, new_points,
-- previous_cycle_id, new_cycle_id, category_change_id) was checked against
-- every unqualified reference in both bodies and found to be either never
-- referenced bare, or only inside contexts plpgsql/Postgres never treats as
-- ambiguous (INSERT column lists, UPDATE SET targets, RETURN QUERY SELECT
-- with only parameters/variables — none of these consult table columns the
-- way a FROM/WHERE clause does).
--
-- Fix: CREATE OR REPLACE FUNCTION on exactly these two functions, adding
-- explicit table aliases and qualifying every reference to the columns the
-- task listed (club_member_id, club_id, cycle_id, category, current_points,
-- and anything else already shared with a parameter/variable/RETURNS TABLE
-- column) — the query logic, control flow, validations, error messages,
-- floor-at-zero rule, effective-zero-adjustment rejection, technical
-- category-change movement, and cycle reuse/creation are byte-for-byte the
-- same as the already-applied 20260822000001; only identifier qualification
-- changed. No other function, table, constraint, index, trigger, RLS policy
-- or grant on any other object is touched by this migration.
--
-- CREATE OR REPLACE FUNCTION preserves existing privileges as long as the
-- function's name and argument types are unchanged (documented PostgreSQL
-- behavior — replacing a function's body never resets its ACL) — true here
-- for both functions (signatures unchanged). Not left as a silent
-- assumption regardless: the REVOKE/GRANT block below re-applies the exact
-- same permissions from 20260822000001 explicitly, so the end state is
-- reproducible and verifiable regardless of that guarantee.
-- ============================================================


-- ─── A. adjust_club_player_points (qualification fix only) ─────────────────
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
  v_role        text;
  v_member      public.club_members%ROWTYPE;
  v_state       public.club_member_sport_state%ROWTYPE;
  v_category    text;
  v_new_total   integer;
  v_movement_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_role := public.club_role(p_club_id);
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
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

  -- FIX: s.club_member_id — bare club_member_id collided with this
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

  -- FIX: c.category — bare category collided with this function's own
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

  -- FIX: s.club_member_id in WHERE — SET target column names (current_points,
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


-- ─── B. change_club_player_category (qualification fix only) ───────────────
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
  v_role               text;
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

  v_role := public.club_role(p_club_id);
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to change category in this club' USING ERRCODE = '42501';
  END IF;

  IF p_change_type NOT IN ('promotion', 'demotion', 'correction') THEN
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

  -- Qualified defensively (cm.id/cm.club_id), same discipline as A above.
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

  -- FIX: s.club_member_id — bare club_member_id collided with this
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

  -- FIX: r.club_member_id — get_club_category_ranking's own result column
  -- club_member_id, read here with no alias, collided with THIS function's
  -- own RETURNS TABLE output column of the same name.
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

  -- FIX: s.club_member_id in WHERE — SET target columns (cycle_id,
  -- current_points, points_reached_at) remain bare, same Postgres syntax
  -- constraint as in A above; none of them were ever ambiguous.
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


-- ─── Permissions — re-applied explicitly, not assumed ──────────────────────
-- CREATE OR REPLACE FUNCTION preserves an existing function's ACL when its
-- name and argument types are unchanged (both true here) — documented
-- PostgreSQL behavior, not a project-specific assumption. Re-applied anyway
-- so the end state is explicit and reproducible rather than resting on that
-- guarantee silently. Identical to what 20260822000001 already granted —
-- no other function's permissions are touched.
REVOKE ALL ON FUNCTION public.adjust_club_player_points(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_club_player_points(uuid, uuid, integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.change_club_player_category(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_club_player_category(uuid, uuid, text, text, text) TO authenticated;
