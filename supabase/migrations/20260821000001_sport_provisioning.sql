-- ============================================================
-- Sport provisioning — Fase 1 (Módulo deportivo), bloque 4
-- Mi Pádel Club
-- ============================================================
-- Implements the complete provisioning pipeline on top of the tables
-- created in 20260820000001: get-or-create the active ranking cycle,
-- provision a single PLAYER's sport state, bulk-provision a whole club,
-- the administrative operation that configures a club's default
-- category, and the automatic trigger that keeps every PLAYER's sport
-- state in sync with real membership events. No ajuste manual de
-- puntos, cambio de categoría, cierre de ciclo, ranking visible o
-- medallas — exclusively the provisioning layer.
--
-- No row is inserted by this migration itself (no backfill runs here —
-- see the header note before section 3 for the explicit, separate
-- mechanism to run later, by hand, once authorized).
--
-- Function inventory and access:
--   public.get_or_create_active_ranking_cycle  — internal only
--   public.provision_club_member_sport_state   — internal only
--   public.provision_club_sport_members        — internal only (also the
--                                                 explicit backfill entry
--                                                 point — see section 3)
--   public.trg_provision_sport_state_on_membership_change — trigger fn,
--                                                 not callable directly
--   public.configure_club_default_player_category — the one public,
--                                                 authenticated-facing
--                                                 administrative RPC
-- "Internal only" matches the exact existing convention already used for
-- _require_club_not_archived/_require_club_admin (REVOKE ALL FROM PUBLIC,
-- no GRANT to authenticated) — callable from other SECURITY DEFINER
-- function bodies in the same transaction, never directly by a client.
-- ============================================================


-- ─── 1. get_or_create_active_ranking_cycle ─────────────────────────────────
-- Concurrency: the same pg_advisory_xact_lock pattern already used by
-- update_reservation (20260814000001) — two concurrent callers for the
-- exact same (club_id, category) serialize on this lock, so the second
-- one's SELECT always finds the row the first one just committed, instead
-- of racing a plain SELECT/IF NOT FOUND/INSERT. The INSERT itself is
-- additionally guarded with ON CONFLICT targeting the partial unique index
-- from 20260820000001 (club_ranking_cycles_one_active_per_club_category)
-- as a second, independent layer of protection — belt-and-suspenders
-- against the astronomically unlikely case of a hashtext collision
-- defeating the lock, never trusting the lock alone to be the only thing
-- standing between this function and a duplicate active cycle.
CREATE OR REPLACE FUNCTION public.get_or_create_active_ranking_cycle(
  p_club_id  uuid,
  p_category text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sport_categories WHERE code = p_category) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_club_id::text || ':' || p_category));

  SELECT id INTO v_cycle_id
  FROM public.club_ranking_cycles
  WHERE club_id = p_club_id AND category = p_category AND ended_at IS NULL;

  IF FOUND THEN
    RETURN v_cycle_id;
  END IF;

  INSERT INTO public.club_ranking_cycles (club_id, category)
  VALUES (p_club_id, p_category)
  ON CONFLICT (club_id, category) WHERE ended_at IS NULL DO NOTHING
  RETURNING id INTO v_cycle_id;

  IF v_cycle_id IS NULL THEN
    SELECT id INTO v_cycle_id
    FROM public.club_ranking_cycles
    WHERE club_id = p_club_id AND category = p_category AND ended_at IS NULL;
  END IF;

  RETURN v_cycle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_active_ranking_cycle(uuid, text) FROM PUBLIC;


-- ─── 2. provision_club_member_sport_state ──────────────────────────────────
-- Single-member provisioning. Idempotent by construction: club_member_id
-- is club_member_sport_state's own primary key, and the INSERT below is
-- ON CONFLICT DO NOTHING against it — calling this twice (or concurrently)
-- for the same membership never duplicates, never resets an existing
-- state's cycle_id/points/points_reached_at.
--
-- Returns club_member_id when a state exists or was just created; NULL
-- for every documented no-op case (not PLAYER, not active, club not yet
-- configured) — never raises for these, so callers (in particular the
-- trigger in section 4) can treat NULL as "nothing to do" rather than an
-- error to handle.
CREATE OR REPLACE FUNCTION public.provision_club_member_sport_state(
  p_club_member_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_member           public.club_members%ROWTYPE;
  v_default_category text;
  v_cycle_id         uuid;
  v_result           uuid;
BEGIN
  SELECT * INTO v_member FROM public.club_members WHERE id = p_club_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;

  -- OWNER/ADMIN never receive a sport state, by design — this is the
  -- single gate every caller (trigger, bulk provisioning, future callers)
  -- goes through, so it can never be bypassed from one call site and not
  -- another.
  IF v_member.role <> 'PLAYER' THEN
    RETURN NULL;
  END IF;

  IF v_member.is_active IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Already provisioned: no-op, exactly as required — never touches
  -- cycle_id, current_points or points_reached_at of an existing row.
  SELECT club_member_id INTO v_result
  FROM public.club_member_sport_state
  WHERE club_member_id = p_club_member_id;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  SELECT default_player_category INTO v_default_category
  FROM public.clubs WHERE id = v_member.club_id;

  -- Club not yet regularized — documented no-op, never invents a category.
  IF v_default_category IS NULL THEN
    RETURN NULL;
  END IF;

  v_cycle_id := public.get_or_create_active_ranking_cycle(v_member.club_id, v_default_category);

  INSERT INTO public.club_member_sport_state
    (club_member_id, club_id, cycle_id, current_points, points_reached_at)
  VALUES
    (p_club_member_id, v_member.club_id, v_cycle_id, 0, now())
  ON CONFLICT (club_member_id) DO NOTHING
  RETURNING club_member_id INTO v_result;

  IF v_result IS NULL THEN
    -- A concurrent call for this exact member won the race — recover its
    -- row instead of treating this as a failure.
    SELECT club_member_id INTO v_result
    FROM public.club_member_sport_state
    WHERE club_member_id = p_club_member_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_club_member_sport_state(uuid) FROM PUBLIC;


-- ─── 3. provision_club_sport_members ───────────────────────────────────────
-- Set-based bulk provisioning for one club — every active PLAYER without a
-- sport state gets one, in a single INSERT ... SELECT, not a per-member
-- loop, so this stays cheap even for clubs with many players. Never
-- touches a club_member_sport_state row that already exists (ON CONFLICT
-- DO NOTHING at the row level, same PK-based guarantee as section 2), and
-- never inserts into the ledger or the category-change history.
--
-- This function is ALSO the explicit backfill entry point (see the
-- "BACKFILL — READ BEFORE RUNNING" note right below): it is intentionally
-- safe to call directly, more than once, for any already-configured club,
-- with no side effect beyond provisioning whatever is currently missing.
CREATE OR REPLACE FUNCTION public.provision_club_sport_members(
  p_club_id uuid
)
RETURNS TABLE (cycle_id uuid, provisioned_count integer, skipped_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_default_category text;
  v_cycle_id          uuid;
  v_provisioned       integer;
  v_total_eligible     integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT default_player_category INTO v_default_category
  FROM public.clubs WHERE id = p_club_id;

  IF v_default_category IS NULL THEN
    RAISE EXCEPTION 'Club has no default_player_category configured' USING ERRCODE = '22023';
  END IF;

  v_cycle_id := public.get_or_create_active_ranking_cycle(p_club_id, v_default_category);

  WITH inserted AS (
    INSERT INTO public.club_member_sport_state
      (club_member_id, club_id, cycle_id, current_points, points_reached_at)
    SELECT cm.id, cm.club_id, v_cycle_id, 0, now()
    FROM public.club_members cm
    WHERE cm.club_id = p_club_id
      AND cm.role = 'PLAYER'
      AND cm.is_active = true
    ON CONFLICT (club_member_id) DO NOTHING
    RETURNING club_member_id
  )
  SELECT count(*) INTO v_provisioned FROM inserted;

  SELECT count(*) INTO v_total_eligible
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id AND cm.role = 'PLAYER' AND cm.is_active = true;

  RETURN QUERY SELECT v_cycle_id, v_provisioned, (v_total_eligible - v_provisioned);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_club_sport_members(uuid) FROM PUBLIC;

-- ─── BACKFILL — READ BEFORE RUNNING ─────────────────────────────────────────
-- Not executed by this migration. Every club configured through the new
-- "Categoría inicial de jugadores" UI (section 6 below) already gets its
-- existing PLAYERs provisioned automatically, in the same transaction, via
-- configure_club_default_player_category. This backfill is only for
-- clubs whose default_player_category was already set some other way
-- (e.g. directly in the SQL Editor before this UI existed) and therefore
-- never went through that flow.
--
-- To regularize every such club at once, run this once from the SQL
-- Editor (connects as a superuser/service role, so the REVOKE ALL FROM
-- PUBLIC above does not block it) — safe to run more than once, touches
-- nothing for a club with no PLAYER gap, never touches OWNER/ADMIN, never
-- resets an existing state, never closes or duplicates a cycle:
--
--   SELECT c.id, c.slug, p.*
--   FROM public.clubs c
--   CROSS JOIN LATERAL public.provision_club_sport_members(c.id) p
--   WHERE c.default_player_category IS NOT NULL;
--
-- Returns one row per already-configured club with cycle_id,
-- provisioned_count (created just now) and skipped_count (already had a
-- state). Recommended first step: run the same query with only
-- `SELECT c.id, c.slug, c.default_player_category FROM public.clubs c
-- WHERE c.default_player_category IS NOT NULL;` (no side effects at all)
-- to see how many clubs are actually affected before running the real
-- one above.
-- ============================================================


-- ─── 4. Automatic provisioning trigger ──────────────────────────────────────
-- Single integration point covering every real path that can leave a
-- club_members row as an active PLAYER, confirmed by inspection:
--   - join_public_club       (INSERT, role='PLAYER', is_active=true)
--   - approve_join_request   (INSERT, role='PLAYER', is_active=true)
--   - claim_invitation       (INSERT, role could be 'PLAYER' for a
--                             historical pre-retirement invitation link)
--   - toggleMemberActive     (direct client UPDATE ... SET is_active=true,
--                             admin/players/actions.ts — the one column
--                             GRANT UPDATE (is_active, category) already
--                             allows from `authenticated`)
-- AFTER INSERT OR UPDATE OF role, is_active with a WHEN clause covers all
-- four uniformly without touching any of those call sites, and never fires
-- for an UPDATE that only touches an unrelated column (e.g. category) —
-- exactly the same shape already used for club_members_set_account_type
-- (20260809000001), which solved an identical "every RPC must remember to
-- do X" problem the same way. SECURITY DEFINER is required here, not
-- optional: toggleMemberActive runs as `authenticated`, which has no grant
-- at all on club_ranking_cycles/club_member_sport_state — only a SECURITY
-- DEFINER trigger function can write those tables regardless of which
-- caller triggered it.
--
-- No exception handling here, deliberately: the only documented no-op
-- case (club without default_player_category) is already resolved inside
-- provision_club_member_sport_state via a plain NULL return, never an
-- exception — so there is nothing legitimate left to catch. Any other
-- error is a real, unexpected failure of sport provisioning, and it must
-- abort the whole membership transaction rather than leave an active
-- PLAYER membership behind with a silently broken/missing sport state.
CREATE OR REPLACE FUNCTION public.trg_provision_sport_state_on_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public.provision_club_member_sport_state(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_provision_sport_state_on_membership_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS club_members_provision_sport_state ON public.club_members;
CREATE TRIGGER club_members_provision_sport_state
  AFTER INSERT OR UPDATE OF role, is_active ON public.club_members
  FOR EACH ROW
  WHEN (NEW.role = 'PLAYER' AND NEW.is_active = true)
  EXECUTE FUNCTION public.trg_provision_sport_state_on_membership_change();


-- ─── 5. configure_club_default_player_category ──────────────────────────────
-- The one public, authenticated-facing entry point of this whole block —
-- everything else above is reachable only through this or the trigger.
-- OWNER/ADMIN of the target club only, re-derived server-side from
-- auth.uid() via club_role() exactly like every other admin RPC in this
-- codebase (archive_club, deactivate_player, etc.) — the client can never
-- pass its own notion of role and have it trusted.
--
-- Single transaction: validate actor → validate category → update
-- clubs.default_player_category → get-or-create the cycle → bulk-provision
-- every PLAYER still missing a state. Changing an already-configured
-- club's default category is explicitly allowed and updates the column,
-- but never touches any club_member_sport_state that already exists —
-- provision_club_sport_members only ever fills genuine gaps, by
-- construction (ON CONFLICT DO NOTHING on the existing PK) — so a second
-- call with a different category can never move, reset or recategorize a
-- player who was already provisioned under the previous one.
CREATE OR REPLACE FUNCTION public.configure_club_default_player_category(
  p_club_id  uuid,
  p_category text
)
RETURNS TABLE (category text, cycle_id uuid, provisioned_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role        text;
  v_cycle_id    uuid;
  v_provisioned integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_role := public.club_role(p_club_id);
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
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
