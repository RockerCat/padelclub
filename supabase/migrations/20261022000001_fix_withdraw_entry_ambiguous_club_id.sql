-- ============================================================
-- withdraw_tournament_entry — fix ambiguous "club_id" column reference
-- Mi Pádel Club
-- ============================================================
-- Real error captured from the live RPC (not guessed):
--   code: 42702
--   message: column reference "club_id" is ambiguous
--   details: It could refer to either a PL/pgSQL variable or a table column.
--   hint: null
--
-- Same root cause and same fix as the sibling tournament functions
-- already corrected (register_tournament_entry: 20261016000001,
-- create_tournament: 20261013000001, open/close_tournament_registration:
-- 20261014000001/20261015000001, cancel_tournament: 20261017000001,
-- start_tournament: 20261018000001, set_tournament_entry_points:
-- 20261019000001): withdraw_tournament_entry's RETURNS TABLE also
-- declares a "club_id" output column, implicitly exposed by PL/pgSQL as
-- a bare variable name throughout the function body. The SUPERADMIN-
-- fallback lookup's NOT EXISTS subquery referenced public.club_members
-- without an alias:
--
--   NOT EXISTS (
--     SELECT 1 FROM public.club_members
--     WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
--   )
--
-- making bare `club_id` ambiguous against that implicit RETURNS TABLE
-- variable — this is why a PLAYER withdrawing their own pair failed with
-- the generic error message every time, before the PLAYER-vs-participant
-- check further down ever ran. The sibling first UNION branch already
-- avoids this correctly by aliasing (`cm.club_id`, `cm.profile_id`,
-- `cm.is_active`) — this migration only applies that same convention to
-- the one subquery that was missing it. This was introduced in
-- 20261008000001_superadmin_club_access.sql alongside the other
-- functions that got the same bug, but was missed by the later
-- ambiguous-column fix migrations, which never touched
-- withdraw_tournament_entry.
--
-- No other line changes: same authorization rules, same status checks,
-- same locking, same UPDATE/RETURN shape.
-- ============================================================

CREATE OR REPLACE FUNCTION public.withdraw_tournament_entry(p_tournament_entry_id uuid)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_entry          public.tournament_entries%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_ids     uuid[];
  v_member_one_id  uuid;
  v_member_two_id  uuid;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT te.tournament_id INTO v_tournament_id FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = v_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(tem.club_member_id) INTO v_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id AND tem.is_active = true;

  IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two active members' USING ERRCODE = '22023';
  END IF;

  v_member_one_id := v_member_ids[1];
  v_member_two_id := v_member_ids[2];

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members AS cm2
        WHERE cm2.club_id = v_tournament.club_id AND cm2.profile_id = auth.uid() AND cm2.is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to withdraw this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> v_member_one_id AND v_caller_member.id <> v_member_two_id THEN
      RAISE EXCEPTION 'A player can only withdraw an entry they are part of' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to withdraw this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Only a pending or confirmed entry can be withdrawn' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows withdrawal' USING ERRCODE = '22023';
  END IF;

  IF v_member_one_id < v_member_two_id THEN
    v_lock_first := v_member_one_id; v_lock_second := v_member_two_id;
  ELSE
    v_lock_first := v_member_two_id; v_lock_second := v_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_second::text));

  UPDATE public.tournament_entries AS te
  SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid()
  WHERE te.id = p_tournament_entry_id AND te.status = v_entry.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament entry was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;
