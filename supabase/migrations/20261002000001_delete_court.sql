-- ============================================================
-- delete_court — safe, permanent court deletion
-- Mi Pádel Club
-- ============================================================
-- Until now courts.courts had no DELETE policy at all — "courts are
-- deactivated, never hard-deleted" (20260611000001). This adds the first
-- real hard-delete path, gated by one rule: a court can only be deleted if
-- it has NEVER had any reservation (any status, any date — past, present
-- or future; match/class/block alike, since those are all just
-- reservations.type values, not separate tables). A court with any
-- history must be deactivated instead (existing toggleCourtActive flow),
-- never deleted — history is never destroyed.
--
-- Audit of every FK pointing at courts(id) (grep across every migration,
-- cross-checked against the generated types):
--   • reservations.court_id       NOT NULL, no ON DELETE clause (defaults
--     to NO ACTION/RESTRICT) — transactional/historical, blocks deletion.
--     This is the ONLY thing this function checks for.
--   • club_pricing_rules.court_id nullable, ON DELETE CASCADE — purely
--     configurative (a per-court tariff override), never itself
--     referenced by a reservation unless that reservation also references
--     this same court_id (price resolution only ever picks a rule scoped
--     to the reservation's own court or a club-wide one). Once we've
--     confirmed zero reservations reference this court, its court-scoped
--     pricing rules can never have been used by any reservation either,
--     so cascading them (and their child club_pricing_rule_prices, itself
--     ON DELETE CASCADE from club_pricing_rules) is safe and requires no
--     extra code here — the existing FK graph already does it.
--   • tournament_court_allocations — table no longer exists (dropped by
--     20260922000001, see CLAUDE.md → Tournament Module Principles: the
--     module was rebuilt with no bracket/matches/rounds/courts/scores).
-- No other table anywhere in the schema references courts(id).
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_court(p_court_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id       uuid;
  v_role          text;
  v_has_activity  boolean;
  v_deleted_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Row-locked so two concurrent delete attempts on the same court
  -- serialize: the loser's SELECT unblocks once the winner's DELETE
  -- commits and simply finds nothing (NOT FOUND below), never a race.
  SELECT club_id INTO v_club_id
  FROM public.courts
  WHERE id = p_court_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court not found' USING ERRCODE = 'P0002';
  END IF;

  -- v_role can be NULL (not a member of this court's club) — IS NULL is
  -- checked explicitly first; NOT IN alone would silently no-op on NULL
  -- (three-valued logic) instead of denying, the exact authorization-
  -- bypass shape CLAUDE.md warns about elsewhere in this codebase.
  v_role := public.club_role(v_club_id);
  IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to delete courts for this club' USING ERRCODE = '42501';
  END IF;

  -- The one and only business rule: no reservation, ever, of any type or
  -- status, past or future, may reference this court.
  SELECT EXISTS (
    SELECT 1 FROM public.reservations WHERE court_id = p_court_id
  ) INTO v_has_activity;

  IF v_has_activity THEN
    RAISE EXCEPTION 'Court has reservation history and cannot be deleted' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.courts WHERE id = p_court_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'Court not found' USING ERRCODE = 'P0002';
  END IF;
EXCEPTION
  -- Backstop for the race where a reservation is inserted for this exact
  -- court between the EXISTS check above and the DELETE — the
  -- reservations_court_id_fkey (RESTRICT by default) raises this itself;
  -- translated to the same distinguishable code the EXISTS check above
  -- already uses, so the caller only ever handles one "has history" case.
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Court has reservation history and cannot be deleted' USING ERRCODE = '23503';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_court(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_court(uuid) TO authenticated;
