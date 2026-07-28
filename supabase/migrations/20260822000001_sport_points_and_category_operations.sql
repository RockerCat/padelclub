-- ============================================================
-- Sport points & category operations — Fase 1 (Módulo deportivo), bloque 5
-- Mi Pádel Club
-- ============================================================
-- Manual point adjustments, manual category changes, the base ranking
-- read query they both build on, and history immutability enforcement.
-- No cycle close/reopen, no automatic threshold-based promotion/demotion,
-- no visible ranking UI, no medals, no tournaments.
--
-- ─── Contradictions found between the task prompt and the real, already-
-- applied schema (20260820000001) — resolved in favor of the real schema,
-- as instructed ("usa los nombres reales... no inventes columnas"):
--
--   1. Column names. The prompt assumes delta_points/previous_points/
--      resulting_points/note on club_player_point_movements. The real,
--      applied columns are delta/previous_total/new_total/comment. Used
--      throughout below; RPC PARAMETERS keep descriptive names
--      (p_delta_points, p_note) since parameters aren't columns.
--
--   2. "note opcional, salvo que una regla real existente exija lo
--      contrario" — such a rule already exists and is already applied:
--      comment NOT NULL + CHECK (length(btrim(comment)) BETWEEN 1 AND 500)
--      on both club_player_point_movements and club_player_category_changes.
--      Both RPCs below therefore require a real note, not an optional one.
--
--   3. "current_points puede quedar negativo, salvo que el esquema
--      congelado ya tenga una restricción contraria" — it does:
--      CHECK (current_points >= 0) on club_member_sport_state, and
--      CHECK (previous_total >= 0), CHECK (new_total >= 0) on the ledger,
--      both already applied. adjust_club_player_points floors at zero
--      (GREATEST(..., 0)) rather than rejecting, matching the already-
--      frozen decision from the earlier Architecture Freeze round ("los
--      puntos nunca pueden quedar por debajo de cero... se acotan
--      automáticamente a cero").
--
--   4. change_club_player_category's "reason_code" — club_player_
--      category_changes has no reason_code column at all; the real column
--      is change_type CHECK IN ('promotion','demotion','correction').
--      The RPC parameter below is p_change_type, not p_reason_code, and
--      is validated against that real 3-value catalog, with the direction
--      (promotion needs a higher sport_categories.sort_order, demotion a
--      lower one, correction either) enforced server-side rather than
--      trusted from the caller.
--
--   5. Technical point movement on category change — CORRECTED. A prior
--      revision of this migration removed this movement, on the mistaken
--      belief that a later task instruction superseded the Architecture
--      Freeze. It does not: the frozen, permanent rule prevails, and it is
--      restored below exactly as originally specified — every category
--      change inserts exactly one technical (origin='system',
--      system_event_code='category_change') row into
--      club_player_point_movements, tied to the previous_cycle_id and to
--      the category_change_id just created, so the ledger remains fully
--      reconstructive per cycle. No opening row is ever created in the new
--      cycle (same "cero movimientos = cero puntos" rule already used for
--      backfill/provisioning).
--
-- No table, column, RLS policy, trigger or index from earlier blocks is
-- modified — this migration only adds new functions/triggers.
-- ============================================================


-- ─── A. adjust_club_player_points ───────────────────────────────────────────
-- Manual delta-mode point adjustment. OWNER/ADMIN of the same active club
-- only, re-derived server-side via club_role(). Row-locks the target's
-- sport state with SELECT ... FOR UPDATE for the rest of the transaction —
-- two concurrent adjustments on the SAME player serialize (the second
-- waits, then reads the first's committed current_points), so neither can
-- lose a movement or overwrite the other's result. Different players
-- adjusted concurrently never contend with each other at all (each locks
-- only its own row).
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

  SELECT * INTO v_member
  FROM public.club_members
  WHERE id = p_club_member_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found in this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_member.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can be adjusted' USING ERRCODE = '42501';
  END IF;

  IF v_member.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot adjust an inactive membership' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_state
  FROM public.club_member_sport_state
  WHERE club_member_id = p_club_member_id
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

  SELECT category INTO v_category
  FROM public.club_ranking_cycles WHERE id = v_state.cycle_id;

  -- Floor at zero — never rejected, per the already-frozen rule (see
  -- contradiction note 3 above). delta stored below is always the
  -- EFFECTIVE change (new_total - previous_total), which already equals
  -- the floored result even when p_delta_points would have gone negative.
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

  UPDATE public.club_member_sport_state
  SET current_points = v_new_total,
      points_reached_at = now()
  WHERE club_member_id = p_club_member_id;

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


-- ─── C. get_club_category_ranking (created before B, which depends on it) ──
-- Read-only base ranking query for one club+category. Order: current_points
-- DESC, points_reached_at ASC, club_member_id ASC as the final stable
-- tie-break — titles/runner-up/third-place aren't stored or derivable from
-- anything yet (no tournament data exists), so they're simply absent from
-- this order, exactly matching the current, honest state of the data.
-- STABLE SQL function (no branching needed for a pure read) — chosen over
-- a view+RLS because every existing precedent in this codebase for a
-- "computed, authorization-checked, multi-row read" (get_club_statistics,
-- get_my_profile_activity, get_public_clubs) is a SECURITY DEFINER
-- function, never a view; there is no view+RLS precedent anywhere in this
-- project to follow instead.
--
-- REVOKE ALL FROM PUBLIC, no GRANT to authenticated: this task explicitly
-- excludes the visible ranking UI ("no implementes todavía la UI pública o
-- administrativa del ranking"), and the public/private club visibility
-- rule for ranking was already deferred in the Architecture Freeze to a
-- future, dedicated projection. Exposing this to authenticated now, before
-- either of those exists, would be premature — right now the only caller
-- is change_club_player_category below (an internal call, which needs no
-- grant). club_id/category scoping in the WHERE clause already satisfies
-- this block's own multi-tenant requirement regardless of who eventually
-- calls it.
CREATE OR REPLACE FUNCTION public.get_club_category_ranking(
  p_club_id  uuid,
  p_category text
)
RETURNS TABLE (
  ranking_position  bigint,
  club_member_id    uuid,
  profile_id        uuid,
  full_name         text,
  category          text,
  current_points    integer,
  points_reached_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    RANK() OVER (
      ORDER BY s.current_points DESC, s.points_reached_at ASC, s.club_member_id ASC
    ) AS ranking_position,
    s.club_member_id,
    cm.profile_id,
    p.full_name,
    c.category,
    s.current_points,
    s.points_reached_at
  FROM public.club_member_sport_state s
  JOIN public.club_ranking_cycles c ON c.id = s.cycle_id AND c.ended_at IS NULL
  JOIN public.club_members cm ON cm.id = s.club_member_id AND cm.club_id = s.club_id
  JOIN public.profiles p ON p.id = cm.profile_id
  WHERE s.club_id = p_club_id
    AND c.category = p_category
    AND cm.role = 'PLAYER'
    AND cm.is_active = true
  ORDER BY ranking_position;
$$;

REVOKE ALL ON FUNCTION public.get_club_category_ranking(uuid, text) FROM PUBLIC;


-- ─── B. change_club_player_category ─────────────────────────────────────────
-- Manual category change. OWNER/ADMIN of the same active club only.
-- change_type is validated both for membership in the fixed 3-value
-- catalog AND, for promotion/demotion specifically, cross-checked against
-- sport_categories.sort_order so an admin can't mislabel a downward move
-- as a "promotion" (or vice versa) — 'correction' is the only change_type
-- allowed in either direction, matching the already-frozen rule.
--
-- Inserts exactly one technical point movement (origin='system',
-- system_event_code='category_change') in the SAME transaction, tied to
-- previous_cycle_id/previous_category and to the category_change_id just
-- created — see contradiction note 5 above (restored, not a new addition).
-- previous_position is computed via get_club_category_ranking on the
-- player's OWN previous category, right before the row that changes it —
-- reuses the exact same ordering as the ranking query instead of
-- duplicating the window-function logic a second time.
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

  SELECT sort_order INTO v_target_sort
  FROM public.sport_categories WHERE code = p_target_category;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid target category' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.club_members
  WHERE id = p_club_member_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found in this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_member.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can change category' USING ERRCODE = '42501';
  END IF;

  IF v_member.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot change category of an inactive membership' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_state
  FROM public.club_member_sport_state
  WHERE club_member_id = p_club_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This player has no sport state yet' USING ERRCODE = 'P0002';
  END IF;

  IF v_state.club_id <> p_club_id THEN
    RAISE EXCEPTION 'Sport state does not belong to this club' USING ERRCODE = '42501';
  END IF;

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

  SELECT ranking_position INTO v_previous_position
  FROM public.get_club_category_ranking(p_club_id, v_previous_category)
  WHERE club_member_id = p_club_member_id;

  v_new_cycle_id := public.get_or_create_active_ranking_cycle(p_club_id, p_target_category);

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
  -- row above, not a second, independently-typed comment.
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

  UPDATE public.club_member_sport_state
  SET cycle_id = v_new_cycle_id,
      current_points = 0,
      points_reached_at = now()
  WHERE club_member_id = p_club_member_id;

  RETURN QUERY SELECT
    p_club_member_id, v_previous_category, p_target_category,
    v_state.current_points, 0, v_state.cycle_id, v_new_cycle_id, v_category_change_id;
END;
$$;

REVOKE ALL ON FUNCTION public.change_club_player_category(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_club_player_category(uuid, uuid, text, text, text) TO authenticated;


-- ─── D. get_club_member_sport_state ──────────────────────────────────────────
-- Not one of the 3 explicitly listed operations, but a minimal, obviously
-- necessary addition: section 5's UI ("ver categoría actual; ver puntos
-- actuales") has no other way to read a single player's current sport
-- state, since club_member_sport_state/club_ranking_cycles were
-- deliberately left with zero RLS policies and no GRANT at all in
-- 20260820000001 — a plain client .from() select would simply be denied.
-- Same OWNER/ADMIN-of-this-club gate as the two operations above; read-only,
-- STABLE, returns zero rows (never an error) when the player has no sport
-- state yet (e.g. club not configured) so the UI can show its own "—".
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.club_role(p_club_id) NOT IN ('OWNER', 'ADMIN') THEN
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


-- ─── History immutability triggers ──────────────────────────────────────────
-- authenticated/anon already cannot INSERT/UPDATE/DELETE on either table
-- at all (RLS enabled with zero policies, no GRANT — 20260820000001), so
-- these triggers are not what stops a client. What they close is a
-- different gap: a SECURITY DEFINER function's body runs as the function's
-- OWNER, who typically owns these tables outright and is therefore NOT
-- restricted by any REVOKE aimed at authenticated/PUBLIC — a bug in this
-- migration or a future one (a new function that accidentally UPDATEs or
-- DELETEs a "historical" row) would otherwise succeed silently. These
-- triggers make that structurally impossible instead of relying on every
-- future function being written correctly.
--
-- Deliberately unconditional — this also blocks service_role/postgres by
-- default. Postgres has no per-role trigger bypass, so that's an explicit
-- trade-off, not an oversight: genuine maintenance (fixing a real data
-- entry mistake) requires first running
-- `ALTER TABLE ... DISABLE TRIGGER <name>`, doing the fix, then
-- `ALTER TABLE ... ENABLE TRIGGER <name>` — a visible, deliberate, two-step
-- action, never a silent accidental UPDATE/DELETE slipping through. Plain
-- (non-SECURITY-DEFINER) trigger function: it only ever raises, never
-- touches another table, so no elevated privilege is needed.
CREATE OR REPLACE FUNCTION public.prevent_immutable_history_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is immutable — % is not permitted on this table. To perform genuine maintenance, explicitly disable this trigger first (ALTER TABLE ... DISABLE TRIGGER), make the change, then re-enable it.',
    TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS club_player_point_movements_immutable ON public.club_player_point_movements;
CREATE TRIGGER club_player_point_movements_immutable
  BEFORE UPDATE OR DELETE ON public.club_player_point_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_history_mutation();

DROP TRIGGER IF EXISTS club_player_category_changes_immutable ON public.club_player_category_changes;
CREATE TRIGGER club_player_category_changes_immutable
  BEFORE UPDATE OR DELETE ON public.club_player_category_changes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_history_mutation();
