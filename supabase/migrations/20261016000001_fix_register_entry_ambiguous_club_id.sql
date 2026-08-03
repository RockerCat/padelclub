-- ============================================================
-- register_tournament_entry — fix ambiguous "club_id" column reference
-- Mi Pádel Club
-- ============================================================
-- Real error captured from the live RPC (not guessed):
--   code: 42702
--   message: column reference "club_id" is ambiguous
--   details: It could refer to either a PL/pgSQL variable or a table column.
--   hint: null
--
-- Same root cause and same fix as the three tournament lifecycle
-- functions already corrected (create_tournament: 20261013000001,
-- open_tournament_registration: 20261014000001,
-- close_tournament_registration: 20261015000001):
-- register_tournament_entry's RETURNS TABLE also declares a "club_id"
-- output column, implicitly exposed by PL/pgSQL as a bare variable name
-- throughout the function body. The SUPERADMIN-fallback lookup's NOT
-- EXISTS subquery referenced public.club_members without an alias:
--
--   NOT EXISTS (
--     SELECT 1 FROM public.club_members
--     WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
--   )
--
-- making bare `club_id` ambiguous against that implicit RETURNS TABLE
-- variable — this is why registering a pair failed with the exact same
-- generic message for OWNER and ADMIN alike (both go through this same
-- authorization block before anything else runs). The sibling first
-- UNION branch already avoids this correctly by aliasing (`cm.club_id`,
-- `cm.profile_id`, `cm.is_active`) — this migration only applies that
-- same convention to the one subquery that was missing it.
--
-- No other line changes: same category checks (single/combined,
-- superior-count limit), same duplicate-active-entry check, same max_pairs
-- capacity check, same admin-confirmed-vs-player-pending INSERT branch,
-- same auto-close-on-capacity call, same PLAYER/OWNER/ADMIN authorization
-- rules.
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_tournament_entry(
  p_tournament_id       uuid,
  p_club_member_one_id  uuid,
  p_club_member_two_id  uuid
)
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
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_one     public.club_members%ROWTYPE;
  v_member_two     public.club_members%ROWTYPE;
  v_category_one   text;
  v_category_two   text;
  v_high_count     int;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_conflict_count int;
  v_entry_count    int;
  v_entry          public.tournament_entries%ROWTYPE;
  v_is_admin       boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_club_member_one_id IS NULL OR p_club_member_two_id IS NULL THEN
    RAISE EXCEPTION 'Both players are required' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id = p_club_member_two_id THEN
    RAISE EXCEPTION 'The two players must be different' USING ERRCODE = '22023';
  END IF;

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
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  v_is_admin := v_caller_member.role IN ('OWNER', 'ADMIN');

  IF v_is_admin THEN
    IF v_tournament.status NOT IN ('registration_open', 'registration_closed', 'in_progress') THEN
      RAISE EXCEPTION 'Tournament is not accepting new pairs' USING ERRCODE = '22023';
    END IF;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> p_club_member_one_id AND v_caller_member.id <> p_club_member_two_id THEN
      RAISE EXCEPTION 'A player can only register a pair they are part of' USING ERRCODE = '42501';
    END IF;
    IF v_tournament.status <> 'registration_open' THEN
      RAISE EXCEPTION 'Tournament registration is not open' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  SELECT * INTO v_member_one
  FROM public.club_members AS cm WHERE cm.id = p_club_member_one_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_member_one.is_active IS NOT TRUE OR v_member_one.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player one is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member_two
  FROM public.club_members AS cm WHERE cm.id = p_club_member_two_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_member_two.is_active IS NOT TRUE OR v_member_two.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player two is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  SELECT c.category INTO v_category_one
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_one_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.category INTO v_category_two
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_two_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.secondary_category IS NULL THEN
    IF v_category_one <> v_tournament.category OR v_category_two <> v_tournament.category THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_category_one NOT IN (v_tournament.category, v_tournament.secondary_category)
       OR v_category_two NOT IN (v_tournament.category, v_tournament.secondary_category) THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;

    v_high_count := 0;
    IF v_category_one = v_tournament.category THEN v_high_count := v_high_count + 1; END IF;
    IF v_category_two = v_tournament.category THEN v_high_count := v_high_count + 1; END IF;
    IF v_high_count > 1 THEN
      RAISE EXCEPTION 'Invalid combined category pair for this tournament' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_club_member_one_id < p_club_member_two_id THEN
    v_lock_first := p_club_member_one_id; v_lock_second := p_club_member_two_id;
  ELSE
    v_lock_first := p_club_member_two_id; v_lock_second := p_club_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = p_tournament_id
    AND tem.club_member_id IN (p_club_member_one_id, p_club_member_two_id)
    AND tem.is_active = true
    AND te.status IN ('pending', 'confirmed');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_admin OR v_tournament.status = 'registration_open' THEN
    SELECT count(*) INTO v_entry_count
    FROM public.tournament_entries AS te
    WHERE te.tournament_id = p_tournament_id AND te.status IN ('pending', 'confirmed');

    IF v_entry_count >= v_tournament.max_pairs THEN
      RAISE EXCEPTION 'Tournament has reached its maximum number of pairs' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_is_admin THEN
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, secondary_category, status, confirmed_at, confirmed_by, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, v_tournament.secondary_category,
      'confirmed', now(), auth.uid(), auth.uid()
    )
    RETURNING * INTO v_entry;
  ELSE
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, secondary_category, status, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, v_tournament.secondary_category,
      'pending', auth.uid()
    )
    RETURNING * INTO v_entry;
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_one_id),
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_two_id);

  IF v_is_admin AND v_tournament.status = 'registration_open' THEN
    PERFORM public._close_tournament_registration_for_capacity(p_tournament_id, v_tournament.max_pairs, auth.uid());
  END IF;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;
