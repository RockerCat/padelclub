-- ============================================================
-- SUPERADMIN "Entrar al club"
-- Mi Pádel Club
-- ============================================================
-- Gives a platform admin (profiles.is_platform_admin = true) temporary,
-- OWNER-equivalent operational access to any ACTIVE club, WITHOUT ever
-- creating a club_members row and WITHOUT touching the real OWNER.
--
-- Note on a related, reverted precedent: 20261004000001 once added
-- is_platform_admin_for_pending_club + a bypass surface, but
-- 20261005000001 fully reverted it — for an UNCLAIMED club (pending_claim
-- = true) the better fix is a real, temporary club_members OWNER row
-- (safe there, since an unclaimed club has no real owner to protect),
-- atomically retired the instant a real owner claims it. That mechanism
-- is deliberately blocked here by enforce_club_members_account_type_
-- consistency, which only allows a platform-admin club_members INSERT
-- when pending_claim = true — every club this feature targets is already
-- claimed (pending_claim = false, permanent), so that trigger actively
-- rejects any attempt to give a SUPERADMIN a real row for it. That is
-- exactly why this feature needs its own additive, non-materializing
-- mechanism instead of repeating the reverted approach.
--
-- Mechanism: two small helpers, then narrowly-scoped, ADDITIVE changes —
-- new RLS policies alongside existing ones (never edited in place), and
-- CREATE OR REPLACE on specific RPC bodies extending their own
-- authorization check with an explicit elevated-access branch. club_role()
-- and is_club_member() themselves are never widened — deliberately, per
-- the lesson the reverted precedent already documented (widening the
-- shared primitive would silently reach every one of its ~80 call sites,
-- including several never audited for this).
--
-- Explicitly EXCLUDED: club_members INSERT (never let elevated access
-- create a membership row — the actual invariant this feature must
-- preserve) and archive_club (its sole gate stays untouched, so elevated
-- access can never archive a club).

-- ─── 1. is_superadmin_club_access — boolean primitive ──────────────────────
CREATE FUNCTION public.is_superadmin_club_access(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles me
    JOIN public.clubs c ON c.id = p_club_id
    WHERE me.id = auth.uid() AND me.is_platform_admin = true AND c.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_superadmin_club_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin_club_access(uuid) TO authenticated;

-- ─── 2. effective_club_role — real membership wins; only falls back to ────
--        elevated access when there is no real membership at all
CREATE FUNCTION public.effective_club_role(p_club_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    public.club_role(p_club_id),
    CASE WHEN public.is_superadmin_club_access(p_club_id) THEN 'OWNER' END
  );
$$;

REVOKE ALL ON FUNCTION public.effective_club_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_club_role(uuid) TO authenticated;


-- ============================================================
-- 3. Additive RLS policies — new sibling policies only, existing ones
--    are never dropped or edited. Only tables/columns actually exercised
--    by a direct (non-RPC) client call are covered; every write already
--    routed through a SECURITY DEFINER RPC is fixed below instead (§4/§5).
-- ============================================================

-- clubs — SELECT: closes a real gap (an active-but-archived club would
-- otherwise 404 for SUPERADMIN, since the public clubs_select_active
-- policy also requires archived_at IS NULL; a real OWNER of that same
-- club still gets full access today, just with an amber banner).
CREATE POLICY "clubs_select_superadmin"
  ON public.clubs FOR SELECT
  USING (public.is_superadmin_club_access(id));

-- clubs — UPDATE: branding/name/logo/cover/gallery/location
-- (settings/actions.ts direct .from("clubs").update() calls).
CREATE POLICY "clubs_update_superadmin"
  ON public.clubs FOR UPDATE
  USING (public.is_superadmin_club_access(id))
  WITH CHECK (public.is_superadmin_club_access(id));

-- club_members — SELECT: Jugadores list.
CREATE POLICY "club_members_select_superadmin"
  ON public.club_members FOR SELECT
  USING (public.is_superadmin_club_access(club_id));

-- club_members — UPDATE: toggleMemberActive's activate-branch,
-- updateMemberCategory. Stricter than the real OWNER/ADMIN policy on
-- purpose — "AND role <> 'OWNER'" guarantees elevated access can never
-- touch the real OWNER's own row, closing a gap the existing policy
-- doesn't itself guard against.
CREATE POLICY "club_members_update_superadmin"
  ON public.club_members FOR UPDATE
  USING (public.is_superadmin_club_access(club_id) AND role <> 'OWNER')
  WITH CHECK (public.is_superadmin_club_access(club_id) AND role <> 'OWNER');

-- courts — INSERT/UPDATE (createCourt/updateCourt/toggleCourtActive are
-- direct table calls; courts SELECT is already public for any active
-- club via courts_select_active_club, no change needed there).
CREATE POLICY "courts_insert_superadmin"
  ON public.courts FOR INSERT
  WITH CHECK (public.is_superadmin_club_access(club_id));

CREATE POLICY "courts_update_superadmin"
  ON public.courts FOR UPDATE
  USING (public.is_superadmin_club_access(club_id));

-- club_operating_hours — INSERT/UPDATE (saveOperatingHours is a direct
-- table upsert; SELECT is already public for any active club via
-- operating_hours_select_active_club).
CREATE POLICY "operating_hours_insert_superadmin"
  ON public.club_operating_hours FOR INSERT
  WITH CHECK (public.is_superadmin_club_access(club_id));

CREATE POLICY "operating_hours_update_superadmin"
  ON public.club_operating_hours FOR UPDATE
  USING (public.is_superadmin_club_access(club_id))
  WITH CHECK (public.is_superadmin_club_access(club_id));

-- invitation_links — INSERT/UPDATE (createAdminInvite/deactivateAdminInvite
-- are direct table calls).
CREATE POLICY "invitation_links_insert_superadmin"
  ON public.invitation_links FOR INSERT
  WITH CHECK (public.is_superadmin_club_access(club_id));

CREATE POLICY "invitation_links_update_superadmin"
  ON public.invitation_links FOR UPDATE
  USING (public.is_superadmin_club_access(club_id));

-- club_pricing_rules — SELECT only (writes always go through
-- upsert_pricing_rule_with_prices, a SECURITY DEFINER RPC, fixed in §4 —
-- RLS never applies to that RPC's own internal writes).
CREATE POLICY "club_pricing_rules_select_superadmin"
  ON public.club_pricing_rules FOR SELECT
  USING (public.is_superadmin_club_access(club_id));

-- club_news — UPDATE/DELETE (updateNews/deleteNews are direct table
-- calls; creation goes through create_club_news, fixed in §5).
CREATE POLICY "club_news_update_superadmin"
  ON public.club_news FOR UPDATE
  USING (public.is_superadmin_club_access(club_id));

CREATE POLICY "club_news_delete_superadmin"
  ON public.club_news FOR DELETE
  USING (public.is_superadmin_club_access(club_id));

-- reservations / reservation_players — SELECT only (the admin dashboard's
-- calendar/list views; every write already goes through a RPC, fixed in
-- §4/§5).
CREATE POLICY "reservations_select_superadmin"
  ON public.reservations FOR SELECT
  USING (public.is_superadmin_club_access(club_id));

CREATE POLICY "reservation_players_select_superadmin"
  ON public.reservation_players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_players.reservation_id
        AND public.is_superadmin_club_access(r.club_id)
    )
  );

-- club_join_requests — SELECT only (approve/reject already go through
-- RPCs, fixed in §4).
CREATE POLICY "club_join_requests_select_superadmin"
  ON public.club_join_requests FOR SELECT
  USING (public.is_superadmin_club_access(club_id));

-- tournaments / tournament_entries / tournament_entry_members — SELECT
-- only (every write already goes through a RPC, fixed in §5). Note:
-- tournament_court_allocations/tournament_matches/match_results were
-- deleted in the tournament "core rebuild" (20260922000001) and no
-- longer exist — deliberately not referenced here.
CREATE POLICY "tournaments_select_superadmin"
  ON public.tournaments FOR SELECT
  USING (public.is_superadmin_club_access(club_id));

CREATE POLICY "tournament_entries_select_superadmin"
  ON public.tournament_entries FOR SELECT
  USING (public.is_superadmin_club_access(club_id));

CREATE POLICY "tournament_entry_members_select_superadmin"
  ON public.tournament_entry_members FOR SELECT
  USING (public.is_superadmin_club_access(club_id));


-- ============================================================
-- 4. Pattern A — RPCs/helpers that call public.club_role(...) directly.
--    Mechanical swap to public.effective_club_role(...), otherwise
--    byte-identical to each function's current live definition.
-- ============================================================

-- _require_club_admin (get_club_statistics's sole gate) — tiny helper,
-- fixing it here automatically fixes every current and future caller.
CREATE OR REPLACE FUNCTION public._require_club_admin(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.effective_club_role(p_club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to view statistics for this club' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- create_reservation_admin
CREATE OR REPLACE FUNCTION public.create_reservation_admin(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_type text,
  p_title text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_hours_error    text;
  v_has_conflict   boolean;
  v_new_start_at   timestamptz;
  v_reservation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.effective_club_role(p_club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to create reservations for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  IF p_type NOT IN ('match', 'class', 'block') THEN
    RAISE EXCEPTION 'Invalid reservation type' USING ERRCODE = 'P0003';
  END IF;
  IF p_type = 'block' AND (p_title IS NULL OR btrim(p_title) = '') THEN
    RAISE EXCEPTION 'Title is required for a block' USING ERRCODE = 'P0003';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts WHERE id = p_court_id AND club_id = p_club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  v_new_start_at := (p_date + p_start_time) AT TIME ZONE 'America/Bogota';
  IF v_new_start_at <= now() THEN
    RAISE EXCEPTION 'Start time is in the past' USING ERRCODE = 'P0003';
  END IF;

  v_hours_error := public._check_operating_hours(p_club_id, p_date, p_start_time, p_duration_minutes);
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  PERFORM public._lock_court_date(p_court_id, p_date);

  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, NULL, ARRAY['confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.reservations (
    club_id, court_id, created_by, date, start_time, duration_minutes, type, status, title, notes
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, p_type, 'confirmed', p_title, p_notes
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

-- update_reservation
CREATE OR REPLACE FUNCTION public.update_reservation(
  p_reservation_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation      public.reservations;
  v_role             text;
  v_current_start_at timestamptz;
  v_new_start_at     timestamptz;
  v_hours_error      text;
  v_has_conflict     boolean;
  v_fields_changed   boolean;
  v_new_status       text;
  v_price            record;
  v_updated_count    int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Reservation is not in an editable state' USING ERRCODE = '22023';
  END IF;

  -- effective_club_role() already scopes to THIS reservation's club and
  -- requires is_active = true.
  v_role := public.effective_club_role(v_reservation.club_id);

  IF v_role IN ('OWNER', 'ADMIN') THEN
    NULL; -- operational edit, no 2-hour window
  ELSIF v_role = 'PLAYER' THEN
    IF v_reservation.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Only the creator can edit this reservation' USING ERRCODE = '42501';
    END IF;

    IF v_reservation.type = 'block' THEN
      RAISE EXCEPTION 'A PLAYER cannot edit a block reservation' USING ERRCODE = '42501';
    END IF;

    v_current_start_at := (v_reservation.date + v_reservation.start_time) AT TIME ZONE 'America/Bogota';
    IF v_current_start_at - now() < interval '2 hours' THEN
      RAISE EXCEPTION 'Cannot edit within 2 hours of the reservation start time' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to edit this reservation' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_reservation.club_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.courts
    WHERE id = p_court_id AND club_id = v_reservation.club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0002';
  END IF;

  v_new_start_at := (p_date + p_start_time) AT TIME ZONE 'America/Bogota';
  IF v_new_start_at <= now() THEN
    RAISE EXCEPTION 'New start time is in the past' USING ERRCODE = 'P0003';
  END IF;

  v_hours_error := public._check_operating_hours(v_reservation.club_id, p_date, p_start_time, p_duration_minutes);
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  PERFORM public._lock_court_date(p_court_id, p_date);

  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, p_reservation_id,
    CASE WHEN v_role = 'PLAYER' THEN ARRAY['pending','confirmed'] ELSE ARRAY['confirmed'] END
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  v_fields_changed := (
    p_court_id <> v_reservation.court_id
    OR p_date <> v_reservation.date
    OR p_start_time <> v_reservation.start_time
    OR p_duration_minutes <> v_reservation.duration_minutes
  );

  IF v_role IN ('OWNER', 'ADMIN') THEN
    UPDATE public.reservations
    SET court_id = p_court_id, date = p_date, start_time = p_start_time, duration_minutes = p_duration_minutes
    WHERE id = p_reservation_id AND status = v_reservation.status;
  ELSE
    IF v_reservation.status = 'pending' OR NOT v_fields_changed THEN
      v_new_status := v_reservation.status;
    ELSE
      v_new_status := 'pending';
    END IF;

    SELECT * INTO v_price FROM public._resolve_reservation_price(
      v_reservation.club_id, p_court_id, p_date, p_start_time, p_duration_minutes
    );
    IF NOT v_price.o_matched THEN
      RAISE EXCEPTION 'No pricing rule configured for this time' USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.reservations
    SET court_id = p_court_id, date = p_date, start_time = p_start_time, duration_minutes = p_duration_minutes,
        status = v_new_status,
        price_amount = v_price.o_price_amount,
        price_currency = v_price.o_price_currency,
        pricing_rule_id = v_price.o_pricing_rule_id,
        price_calculated_at = now()
    WHERE id = p_reservation_id AND status = v_reservation.status;
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation was modified or resolved concurrently' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- approve_pending_reservation
CREATE OR REPLACE FUNCTION public.approve_pending_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation   public.reservations;
  v_role          text;
  v_hours_error   text;
  v_has_conflict  boolean;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.effective_club_role(v_reservation.club_id);
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to approve reservations for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_reservation.club_id);

  IF v_reservation.status <> 'pending' THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts
    WHERE id = v_reservation.court_id AND club_id = v_reservation.club_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Court not found or inactive in this club' USING ERRCODE = 'P0004';
  END IF;

  v_hours_error := public._check_operating_hours(
    v_reservation.club_id, v_reservation.date, v_reservation.start_time, v_reservation.duration_minutes
  );
  IF v_hours_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_hours_error USING ERRCODE = 'P0003';
  END IF;

  PERFORM public._lock_court_date(v_reservation.court_id, v_reservation.date);

  IF NOT EXISTS (
    SELECT 1 FROM public.reservations WHERE id = p_reservation_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;

  v_has_conflict := public._check_reservation_conflict(
    v_reservation.court_id, v_reservation.date, v_reservation.start_time, v_reservation.duration_minutes,
    p_reservation_id, ARRAY['confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Time slot was confirmed for another reservation' USING ERRCODE = '23P01';
  END IF;

  UPDATE public.reservations
  SET status = 'confirmed'
  WHERE id = p_reservation_id AND status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- upsert_pricing_rule_with_prices
CREATE OR REPLACE FUNCTION public.upsert_pricing_rule_with_prices(
  p_rule_id uuid,
  p_club_id uuid,
  p_court_id uuid,
  p_name text,
  p_days_of_week integer[],
  p_start_time time,
  p_end_time time,
  p_display_order integer,
  p_prices jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_rule_id        uuid;
  v_price          jsonb;
  v_kept_durations integer[];
BEGIN
  IF public.effective_club_role(p_club_id) IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_rule_id IS NULL THEN
    INSERT INTO public.club_pricing_rules
      (club_id, court_id, name, days_of_week, start_time, end_time, display_order)
    VALUES
      (p_club_id, p_court_id, p_name, p_days_of_week, p_start_time, p_end_time, p_display_order)
    RETURNING id INTO v_rule_id;
  ELSE
    UPDATE public.club_pricing_rules
    SET court_id = p_court_id,
        name = p_name,
        days_of_week = p_days_of_week,
        start_time = p_start_time,
        end_time = p_end_time,
        display_order = p_display_order
    WHERE id = p_rule_id AND club_id = p_club_id
    RETURNING id INTO v_rule_id;

    IF v_rule_id IS NULL THEN
      RAISE EXCEPTION 'Rule not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  FOR v_price IN SELECT jsonb_array_elements(p_prices)
  LOOP
    INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
    VALUES (
      v_rule_id,
      (v_price->>'duration_minutes')::integer,
      (v_price->>'price_amount')::numeric,
      COALESCE(v_price->>'currency', 'COP')
    )
    ON CONFLICT (pricing_rule_id, duration_minutes)
    DO UPDATE SET
      price_amount = EXCLUDED.price_amount,
      currency = EXCLUDED.currency,
      updated_at = now();
  END LOOP;

  SELECT array_agg((elem->>'duration_minutes')::integer) INTO v_kept_durations
  FROM jsonb_array_elements(p_prices) AS elem;

  DELETE FROM public.club_pricing_rule_prices
  WHERE pricing_rule_id = v_rule_id
    AND NOT (duration_minutes = ANY(COALESCE(v_kept_durations, ARRAY[]::integer[])));

  RETURN v_rule_id;
END;
$$;

-- delete_court
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

  SELECT club_id INTO v_club_id
  FROM public.courts
  WHERE id = p_court_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.effective_club_role(v_club_id);
  IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to delete courts for this club' USING ERRCODE = '42501';
  END IF;

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
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Court has reservation history and cannot be deleted' USING ERRCODE = '23503';
END;
$$;

-- deactivate_player
CREATE OR REPLACE FUNCTION public.deactivate_player(p_club_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_executor_role        text;
  v_target                public.club_members;
  v_target_account_type   text;
  v_reservation_id        uuid;
  v_participant_row       RECORD;
  v_updated_count         int;
  v_player_name           text;
  v_club_name              text;
  v_club_slug              text;
  v_court_name             text;
  v_date_label             text;
  v_creator_role           text;
  v_destination            text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_executor_role := public.effective_club_role(p_club_id);
  IF v_executor_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to deactivate members of this club' USING ERRCODE = '42501';
  END IF;

  IF p_player_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot deactivate yourself' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.club_members
  WHERE club_id = p_club_id AND profile_id = p_player_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not an active member of this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_target.role != 'PLAYER' THEN
    RAISE EXCEPTION 'Only a PLAYER membership can be deactivated this way' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO v_target_account_type FROM public.profiles WHERE id = p_player_id;
  IF v_target_account_type IS DISTINCT FROM 'PLAYER' THEN
    RAISE EXCEPTION 'Target profile is not a PLAYER account' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = p_player_id;
  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;

  FOR v_reservation_id IN
    SELECT r.id FROM public.reservations r
    WHERE r.club_id = p_club_id
      AND r.created_by = p_player_id
      AND r.status IN ('pending', 'confirmed')
      AND r.type != 'block'
  LOOP
    UPDATE public.reservations
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
    WHERE id = v_reservation_id
      AND status IN ('pending', 'confirmed');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count > 0 THEN
      PERFORM public.notify_reservation_cancelled(v_reservation_id);
    END IF;
  END LOOP;

  FOR v_participant_row IN
    SELECT r.id AS reservation_id, r.created_by AS creator_id, r.date, r.start_time,
           r.duration_minutes, r.court_id
    FROM public.reservations r
    JOIN public.reservation_players rp ON rp.reservation_id = r.id
    WHERE r.club_id = p_club_id
      AND rp.profile_id = p_player_id
      AND r.created_by != p_player_id
      AND r.status IN ('pending', 'confirmed')
      AND r.type != 'block'
      AND (r.date + r.start_time) AT TIME ZONE 'America/Bogota' > now()
  LOOP
    DELETE FROM public.reservation_players
    WHERE reservation_id = v_participant_row.reservation_id AND profile_id = p_player_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      CONTINUE;
    END IF;

    SELECT name INTO v_court_name FROM public.courts WHERE id = v_participant_row.court_id;
    v_date_label := CASE
      WHEN v_participant_row.date = current_date THEN 'hoy'
      WHEN v_participant_row.date = current_date + 1 THEN 'mañana'
      ELSE to_char(v_participant_row.date, 'DD/MM')
    END;

    SELECT role INTO v_creator_role
    FROM public.club_members
    WHERE club_id = p_club_id AND profile_id = v_participant_row.creator_id AND is_active = true;

    v_destination := CASE
      WHEN v_creator_role IN ('OWNER', 'ADMIN')
        THEN '/' || v_club_slug || '/admin/reservations/' || v_participant_row.reservation_id
      ELSE '/' || v_club_slug || '/reservations?reservationId=' || v_participant_row.reservation_id
    END;

    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    VALUES (
      v_participant_row.creator_id,
      p_club_id,
      'reservation_participant_left',
      'Un jugador dejó tu reserva',
      COALESCE(v_player_name, 'Un jugador') || ' ya no participará en tu reserva en ' ||
        COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_participant_row.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_participant_row.start_time + (v_participant_row.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
      jsonb_build_object(
        'club_id', p_club_id,
        'club_slug', v_club_slug,
        'reservation_id', v_participant_row.reservation_id,
        'former_participant_profile_id', p_player_id,
        'destination', v_destination
      )
    );
  END LOOP;

  UPDATE public.club_members
  SET is_active = false
  WHERE club_id = p_club_id AND profile_id = p_player_id AND is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Already deactivated' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    p_player_id,
    p_club_id,
    'player_deactivated',
    'Acceso desactivado',
    'Tu acceso a ' || COALESCE(v_club_name, 'el club') || ' fue desactivado por el club.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'destination', '/clubs'
    )
  );
END;
$$;

-- approve_join_request
CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_request       public.club_join_requests;
  v_club_name     text;
  v_club_slug     text;
  v_account_type  text;
BEGIN
  SELECT * INTO v_request FROM public.club_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.effective_club_role(v_request.club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_request.club_id);

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved' USING ERRCODE = '22023';
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = v_request.profile_id;
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This requester cannot become a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  PERFORM public._require_player_phone(v_request.profile_id);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_request.club_id, v_request.profile_id, 'PLAYER', true)
  ON CONFLICT (club_id, profile_id) DO NOTHING;

  UPDATE public.profiles SET account_type = 'PLAYER' WHERE id = v_request.profile_id AND account_type IS NULL;

  UPDATE public.club_join_requests
  SET status = 'approved', approved_at = now(), approved_by = auth.uid()
  WHERE id = p_request_id;

  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = v_request.club_id;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  VALUES (
    v_request.profile_id,
    v_request.club_id,
    'join_request_approved',
    'Solicitud aprobada',
    'Tu solicitud para unirte a ' || COALESCE(v_club_name, 'el club') || ' fue aprobada.',
    jsonb_build_object(
      'club_id', v_request.club_id,
      'club_slug', v_club_slug,
      'destination', '/' || v_club_slug
    )
  );

  UPDATE public.notifications
  SET resolved_status = 'approved', resolved_at = now()
  WHERE type = 'join_request_created'
    AND (metadata->>'join_request_id')::uuid = p_request_id;
END;
$$;

-- reject_join_request
CREATE OR REPLACE FUNCTION public.reject_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_request    public.club_join_requests;
  v_club_name  text;
BEGIN
  SELECT * INTO v_request FROM public.club_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.effective_club_role(v_request.club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved' USING ERRCODE = '22023';
  END IF;

  UPDATE public.club_join_requests
  SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid()
  WHERE id = p_request_id;

  SELECT name INTO v_club_name FROM public.clubs WHERE id = v_request.club_id;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message)
  VALUES (
    v_request.profile_id,
    v_request.club_id,
    'join_request_rejected',
    'Solicitud rechazada',
    'Tu solicitud para unirte a ' || COALESCE(v_club_name, 'el club') || ' fue rechazada.'
  );

  UPDATE public.notifications
  SET resolved_status = 'rejected', resolved_at = now()
  WHERE type = 'join_request_created'
    AND (metadata->>'join_request_id')::uuid = p_request_id;
END;
$$;


-- ============================================================
-- 5. Pattern B — RPCs with their own inline club_members lookup. Same
--    SELECT ... INTO shape preserved exactly (a plain function-call
--    assignment does not set the implicit FOUND variable the way
--    SELECT INTO does, so the fallback is unioned into the SELECT itself,
--    never bolted on afterward). club_members' real physical column
--    order (id, club_id, profile_id, role, is_active, joined_at,
--    category) is matched exactly by the synthetic row.
-- ============================================================

-- create_tournament
CREATE OR REPLACE FUNCTION public.create_tournament(
  p_club_id                     uuid,
  p_name                        text,
  p_category                    text,
  p_max_pairs                   integer,
  p_description                 text DEFAULT NULL,
  p_visibility                  text DEFAULT 'private',
  p_registration_opens_at       timestamptz DEFAULT NULL,
  p_registration_closes_at      timestamptz DEFAULT NULL,
  p_starts_at                   timestamptz DEFAULT NULL,
  p_estimated_duration_minutes  integer DEFAULT NULL,
  p_secondary_category          text DEFAULT NULL,
  p_prize_description           text DEFAULT NULL,
  p_cover_image_url             text DEFAULT NULL
)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_name           text;
  v_description    text;
  v_prize          text;
  v_tournament     public.tournaments%ROWTYPE;
  v_primary_sort   smallint;
  v_secondary_sort smallint;
  v_base_slug      text;
  v_candidate_slug text;
  v_date_part      text;
  v_suffix         int := 0;
  v_constraint     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, p_club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(p_club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to create tournaments for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tournament name cannot be blank' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_prize := NULLIF(btrim(COALESCE(p_prize_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  IF p_secondary_category IS NOT NULL THEN
    IF p_secondary_category = p_category THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    SELECT sort_order INTO v_primary_sort FROM public.sport_categories WHERE code = p_category;
    SELECT sort_order INTO v_secondary_sort FROM public.sport_categories WHERE code = p_secondary_category;

    IF v_secondary_sort IS NULL OR v_primary_sort <= v_secondary_sort THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_max_pairs IS NULL OR p_max_pairs < 1 THEN
    RAISE EXCEPTION 'Invalid max pairs' USING ERRCODE = '22023';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_duration_minutes IS NOT NULL AND p_estimated_duration_minutes < 1 THEN
    RAISE EXCEPTION 'Invalid estimated duration' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  v_base_slug := COALESCE(public._slugify_tournament_name(v_name), 'torneo');
  v_candidate_slug := v_base_slug;

  LOOP
    BEGIN
      INSERT INTO public.tournaments (
        club_id, name, slug, description, category, secondary_category, max_pairs, visibility,
        registration_opens_at, registration_closes_at, starts_at, estimated_duration_minutes,
        prize_description, cover_image_url, created_by
      ) VALUES (
        p_club_id, v_name, v_candidate_slug, v_description, p_category, p_secondary_category, p_max_pairs, p_visibility,
        p_registration_opens_at, p_registration_closes_at, p_starts_at, p_estimated_duration_minutes,
        v_prize, NULLIF(btrim(COALESCE(p_cover_image_url, '')), ''), auth.uid()
      )
      RETURNING * INTO v_tournament;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'tournaments_club_id_slug_key' THEN
        RAISE;
      END IF;

      IF v_suffix = 0 THEN
        v_date_part := to_char(COALESCE(p_starts_at, now()), 'YYYYMMDD');
        v_candidate_slug := v_base_slug || '-' || v_date_part;
        v_suffix := 2;
      ELSE
        v_candidate_slug := v_base_slug || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END IF;

      IF v_suffix > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique tournament slug after multiple attempts' USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- update_tournament
CREATE OR REPLACE FUNCTION public.update_tournament(
  p_tournament_id               uuid,
  p_name                        text,
  p_description                 text,
  p_category                    text,
  p_max_pairs                   integer,
  p_visibility                  text,
  p_registration_opens_at       timestamptz,
  p_registration_closes_at      timestamptz,
  p_starts_at                   timestamptz,
  p_estimated_duration_minutes  integer,
  p_secondary_category          text,
  p_prize_description           text,
  p_cover_image_url             text
)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member       public.club_members%ROWTYPE;
  v_tournament           public.tournaments%ROWTYPE;
  v_name                 text;
  v_description          text;
  v_prize                text;
  v_updated_count        int;
  v_primary_sort         smallint;
  v_secondary_sort       smallint;
  v_active_entries_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status NOT IN ('draft', 'registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not in an editable state' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status IN ('registration_open', 'registration_closed') THEN
    IF p_category IS DISTINCT FROM v_tournament.category THEN
      RAISE EXCEPTION 'category cannot change once registration is open' USING ERRCODE = '22023';
    END IF;
    IF p_secondary_category IS DISTINCT FROM v_tournament.secondary_category THEN
      RAISE EXCEPTION 'secondary_category cannot change once registration is open' USING ERRCODE = '22023';
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
  v_prize := NULLIF(btrim(COALESCE(p_prize_description, '')), '');

  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sport_categories AS sc WHERE sc.code = p_category
  ) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  IF p_secondary_category IS NOT NULL THEN
    IF p_secondary_category = p_category THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;

    SELECT sort_order INTO v_primary_sort FROM public.sport_categories WHERE code = p_category;
    SELECT sort_order INTO v_secondary_sort FROM public.sport_categories WHERE code = p_secondary_category;

    IF v_secondary_sort IS NULL OR v_primary_sort <= v_secondary_sort THEN
      RAISE EXCEPTION 'Invalid tournament category combination' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_max_pairs IS NULL OR p_max_pairs < 1 THEN
    RAISE EXCEPTION 'Invalid max pairs' USING ERRCODE = '22023';
  END IF;

  IF p_max_pairs IS DISTINCT FROM v_tournament.max_pairs THEN
    SELECT count(*) INTO v_active_entries_count
    FROM public.tournament_entries AS te
    WHERE te.tournament_id = p_tournament_id AND te.status IN ('pending', 'confirmed');

    IF p_max_pairs < v_active_entries_count THEN
      RAISE EXCEPTION 'max_pairs cannot be less than % active tournament entries', v_active_entries_count
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_duration_minutes IS NOT NULL AND p_estimated_duration_minutes < 1 THEN
    RAISE EXCEPTION 'Invalid estimated duration' USING ERRCODE = '22023';
  END IF;

  IF p_registration_opens_at IS NOT NULL AND p_registration_closes_at IS NOT NULL
     AND p_registration_opens_at >= p_registration_closes_at THEN
    RAISE EXCEPTION 'registration_opens_at must be before registration_closes_at' USING ERRCODE = '22023';
  END IF;

  IF p_registration_closes_at IS NOT NULL AND p_starts_at IS NOT NULL
     AND p_registration_closes_at > p_starts_at THEN
    RAISE EXCEPTION 'registration_closes_at must not be after starts_at' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET name = v_name,
      description = v_description,
      category = p_category,
      secondary_category = p_secondary_category,
      max_pairs = p_max_pairs,
      visibility = p_visibility,
      registration_opens_at = p_registration_opens_at,
      registration_closes_at = p_registration_closes_at,
      starts_at = p_starts_at,
      estimated_duration_minutes = p_estimated_duration_minutes,
      prize_description = v_prize,
      cover_image_url = NULLIF(btrim(COALESCE(p_cover_image_url, '')), '')
  WHERE t.id = p_tournament_id AND t.status = v_tournament.status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament was modified concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- open_tournament_registration
CREATE OR REPLACE FUNCTION public.open_tournament_registration(p_tournament_id uuid)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
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

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to open registration for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to open registration for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft tournament can open registration' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.registration_opens_at IS NULL OR v_tournament.registration_closes_at IS NULL
     OR v_tournament.starts_at IS NULL OR v_tournament.estimated_duration_minutes IS NULL THEN
    RAISE EXCEPTION 'Tournament schedule is not fully configured' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_open'
  WHERE t.id = p_tournament_id AND t.status = 'draft';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament is no longer in draft' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- close_tournament_registration
CREATE OR REPLACE FUNCTION public.close_tournament_registration(p_tournament_id uuid)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
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

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to close registration for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
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

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- reopen_tournament_registration
CREATE OR REPLACE FUNCTION public.reopen_tournament_registration(p_tournament_id uuid)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
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

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to reopen registration for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to reopen registration for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'registration_closed' THEN
    RAISE EXCEPTION 'Only a tournament with closed registration can reopen' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_open'
  WHERE t.id = p_tournament_id AND t.status = 'registration_closed';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament registration is no longer closed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- cancel_tournament
CREATE OR REPLACE FUNCTION public.cancel_tournament(p_tournament_id uuid)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
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

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to cancel this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to cancel this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status NOT IN ('draft', 'registration_open', 'registration_closed', 'in_progress') THEN
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

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- start_tournament
CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id uuid)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member   public.club_members%ROWTYPE;
  v_tournament      public.tournaments%ROWTYPE;
  v_confirmed_count int;
  v_updated_count   int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to start this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to start this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'registration_closed' THEN
    RAISE EXCEPTION 'Only a tournament with closed registration can start' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_confirmed_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_count < 1 THEN
    RAISE EXCEPTION 'Tournament needs at least one confirmed pair to start' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'in_progress', started_at = now(), started_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.status = 'registration_closed';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- update_tournament_cover_image
CREATE OR REPLACE FUNCTION public.update_tournament_cover_image(
  p_tournament_id   uuid,
  p_cover_image_url text
)
RETURNS TABLE (
  id                          uuid,
  club_id                     uuid,
  name                        text,
  slug                        text,
  description                 text,
  category                    text,
  secondary_category          text,
  max_pairs                   integer,
  status                      text,
  visibility                  text,
  registration_opens_at       timestamptz,
  registration_closes_at      timestamptz,
  starts_at                   timestamptz,
  estimated_duration_minutes  integer,
  started_at                  timestamptz,
  started_by                  uuid,
  completed_at                timestamptz,
  completed_by                uuid,
  cancelled_at                timestamptz,
  cancelled_by                uuid,
  prize_description           text,
  cover_image_url             text,
  created_by                  uuid,
  created_at                  timestamptz,
  updated_at                  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_tournament     public.tournaments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to update this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  UPDATE public.tournaments AS t
  SET cover_image_url = NULLIF(btrim(COALESCE(p_cover_image_url, '')), '')
  WHERE t.id = p_tournament_id;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.slug, v_tournament.description,
    v_tournament.category, v_tournament.secondary_category, v_tournament.max_pairs,
    v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.estimated_duration_minutes,
    v_tournament.started_at, v_tournament.started_by,
    v_tournament.completed_at, v_tournament.completed_by,
    v_tournament.cancelled_at, v_tournament.cancelled_by,
    v_tournament.prize_description, v_tournament.cover_image_url,
    v_tournament.created_by, v_tournament.created_at, v_tournament.updated_at;
END;
$$;

-- register_tournament_entry
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
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
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

-- confirm_tournament_entry
CREATE OR REPLACE FUNCTION public.confirm_tournament_entry(p_tournament_entry_id uuid)
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
  v_conflict_count int;
  v_entry_count    int;
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

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to confirm this tournament entry' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to confirm this tournament entry' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending entry can be confirmed' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not accepting confirmations' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(tem.club_member_id) INTO v_member_ids
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id AND tem.is_active = true;

  IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two active members' USING ERRCODE = '22023';
  END IF;

  v_member_one_id := v_member_ids[1];
  v_member_two_id := v_member_ids[2];

  IF v_member_one_id < v_member_two_id THEN
    v_lock_first := v_member_one_id; v_lock_second := v_member_two_id;
  ELSE
    v_lock_first := v_member_two_id; v_lock_second := v_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = v_tournament_id
    AND tem.club_member_id IN (v_member_one_id, v_member_two_id)
    AND tem.is_active = true
    AND te.status IN ('pending', 'confirmed')
    AND te.id <> p_tournament_entry_id;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has another active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_entry_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = v_tournament_id AND te.status = 'confirmed';

  IF v_entry_count >= v_tournament.max_pairs THEN
    RAISE EXCEPTION 'Tournament has reached its maximum number of pairs' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
  WHERE te.id = p_tournament_entry_id AND te.status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament entry was modified concurrently' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status = 'registration_open' THEN
    PERFORM public._close_tournament_registration_for_capacity(v_tournament_id, v_tournament.max_pairs, auth.uid());
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;

-- reject_tournament_entry
CREATE OR REPLACE FUNCTION public.reject_tournament_entry(
  p_tournament_entry_id uuid,
  p_reason              text
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
  v_tournament_id  uuid;
  v_tournament     public.tournaments%ROWTYPE;
  v_entry          public.tournament_entries%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_reason         text;
  v_updated_count  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE = '22023';
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

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to reject this tournament entry' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to reject this tournament entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending entry can be rejected' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'Tournament is not in a state that allows rejection' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), rejection_reason = v_reason
  WHERE te.id = p_tournament_entry_id AND te.status = 'pending';

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

-- withdraw_tournament_entry
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
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
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

-- replace_tournament_entry_member
CREATE OR REPLACE FUNCTION public.replace_tournament_entry_member(
  p_tournament_entry_id  uuid,
  p_old_club_member_id   uuid,
  p_new_club_member_id   uuid
)
RETURNS TABLE (
  id                   uuid,
  tournament_entry_id  uuid,
  tournament_id        uuid,
  club_id              uuid,
  club_member_id       uuid,
  is_active            boolean,
  replaced_at          timestamptz,
  replaced_by          uuid,
  created_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_entry            public.tournament_entries%ROWTYPE;
  v_tournament        public.tournaments%ROWTYPE;
  v_caller_member     public.club_members%ROWTYPE;
  v_new_member         public.club_members%ROWTYPE;
  v_partner_member_id  uuid;
  v_new_category        text;
  v_partner_category     text;
  v_old_row_exists       boolean;
  v_lock_first           uuid;
  v_lock_second           uuid;
  v_conflict_count        int;
  v_updated_count         int;
  v_new_row               public.tournament_entry_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_old_club_member_id IS NULL OR p_new_club_member_id IS NULL THEN
    RAISE EXCEPTION 'Both the outgoing and incoming players are required' USING ERRCODE = '22023';
  END IF;
  IF p_old_club_member_id = p_new_club_member_id THEN
    RAISE EXCEPTION 'The incoming player must be different from the outgoing player' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = p_tournament_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = v_entry.tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to replace a member of this entry' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to replace a member of this entry' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_entry.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed entry can have its members replaced' USING ERRCODE = '22023';
  END IF;
  IF v_tournament.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Members can only be replaced while the tournament is in progress' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_entry_members AS tem
    WHERE tem.tournament_entry_id = p_tournament_entry_id
      AND tem.club_member_id = p_old_club_member_id AND tem.is_active = true
  ) INTO v_old_row_exists;
  IF NOT v_old_row_exists THEN
    RAISE EXCEPTION 'The outgoing player is not an active member of this entry' USING ERRCODE = '22023';
  END IF;

  SELECT tem.club_member_id INTO v_partner_member_id
  FROM public.tournament_entry_members AS tem
  WHERE tem.tournament_entry_id = p_tournament_entry_id
    AND tem.is_active = true AND tem.club_member_id <> p_old_club_member_id;
  IF v_partner_member_id IS NULL THEN
    RAISE EXCEPTION 'Tournament entry does not have exactly two active members' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_new_member
  FROM public.club_members AS cm WHERE cm.id = p_new_club_member_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_new_member.is_active IS NOT TRUE OR v_new_member.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Incoming player is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  IF p_old_club_member_id < p_new_club_member_id THEN
    v_lock_first := p_old_club_member_id; v_lock_second := p_new_club_member_id;
  ELSE
    v_lock_first := p_new_club_member_id; v_lock_second := p_old_club_member_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_entry.tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || v_entry.tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = v_entry.tournament_id
    AND tem.club_member_id = p_new_club_member_id
    AND tem.is_active = true
    AND te.status IN ('pending', 'confirmed');
  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'The incoming player already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT c.category INTO v_new_category
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_new_club_member_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.category INTO v_partner_category
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = v_partner_member_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.secondary_category IS NULL THEN
    IF v_new_category <> v_tournament.category THEN
      RAISE EXCEPTION 'Incoming player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_new_category NOT IN (v_tournament.category, v_tournament.secondary_category) THEN
      RAISE EXCEPTION 'Incoming player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
    IF v_new_category = v_tournament.category AND v_partner_category = v_tournament.category THEN
      RAISE EXCEPTION 'Invalid combined category pair for this tournament' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.tournament_entry_members AS tem
  SET is_active = false, replaced_at = now(), replaced_by = auth.uid()
  WHERE tem.tournament_entry_id = p_tournament_entry_id
    AND tem.club_member_id = p_old_club_member_id AND tem.is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Outgoing player was modified concurrently' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES (p_tournament_entry_id, v_entry.tournament_id, v_tournament.club_id, p_new_club_member_id)
  RETURNING * INTO v_new_row;

  RETURN QUERY SELECT
    v_new_row.id, v_new_row.tournament_entry_id, v_new_row.tournament_id, v_new_row.club_id,
    v_new_row.club_member_id, v_new_row.is_active, v_new_row.replaced_at, v_new_row.replaced_by,
    v_new_row.created_at;
END;
$$;

-- set_tournament_entry_points
CREATE OR REPLACE FUNCTION public.set_tournament_entry_points(
  p_tournament_id uuid,
  p_entry_ids     uuid[],
  p_points        integer[]
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
  v_count          int;
  v_bad_count      int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to edit points for this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to edit points for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  IF v_tournament.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Tournament is not in progress' USING ERRCODE = '22023';
  END IF;

  IF p_entry_ids IS NULL OR p_points IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No entries provided' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_entry_ids, 1) <> array_length(p_points, 1) THEN
    RAISE EXCEPTION 'Entry ids and points must have the same length' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count FROM unnest(p_points) AS pt WHERE pt IS NULL OR pt < 0;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Points must be non-negative integers' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count FROM (SELECT DISTINCT x FROM unnest(p_entry_ids) AS x) AS d;
  IF v_bad_count <> array_length(p_entry_ids, 1) THEN
    RAISE EXCEPTION 'Duplicate entry ids provided' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.tournament_entries AS te
  WHERE te.id = ANY(p_entry_ids) AND te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_count <> array_length(p_entry_ids, 1) THEN
    RAISE EXCEPTION 'All entries must be confirmed entries of this tournament' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_entries AS te
  SET points = u.points
  FROM (SELECT unnest(p_entry_ids) AS entry_id, unnest(p_points) AS points) AS u
  WHERE te.id = u.entry_id;

  RETURN QUERY
  SELECT te.id, te.tournament_id, te.club_id, te.category, te.secondary_category, te.status, te.points,
         te.confirmed_at, te.confirmed_by, te.withdrawn_at, te.withdrawn_by,
         te.rejected_at, te.rejected_by, te.rejection_reason,
         te.created_by, te.created_at, te.updated_at
  FROM public.tournament_entries AS te
  WHERE te.id = ANY(p_entry_ids);
END;
$$;

-- finalize_tournament
CREATE OR REPLACE FUNCTION public.finalize_tournament(p_tournament_id uuid)
RETURNS TABLE (
  tournament_id      uuid,
  entries_awarded    integer,
  movements_created  integer,
  already_finalized  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament          public.tournaments%ROWTYPE;
  v_caller_member       public.club_members%ROWTYPE;
  v_confirmed_ids       uuid[];
  v_expected_movements  int;
  v_existing_movements  int;
  v_entry_id            uuid;
  v_entry               public.tournament_entries%ROWTYPE;
  v_member_ids          uuid[];
  v_member_id           uuid;
  v_state               public.club_member_sport_state%ROWTYPE;
  v_category            text;
  v_new_total           integer;
  v_movement_count      integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = v_tournament.club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to finalize this tournament' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to finalize this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status NOT IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION 'Tournament is not in progress' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(te.id) INTO v_confirmed_ids
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id AND te.status = 'confirmed';

  IF v_confirmed_ids IS NULL OR array_length(v_confirmed_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Tournament has no confirmed entries' USING ERRCODE = '22023';
  END IF;

  v_expected_movements := array_length(v_confirmed_ids, 1) * 2;

  SELECT count(*) INTO v_existing_movements
  FROM public.club_player_point_movements AS m
  WHERE m.tournament_id = p_tournament_id AND m.system_event_code = 'tournament_points';

  IF v_tournament.status = 'completed' THEN
    IF v_existing_movements <> v_expected_movements THEN
      RAISE EXCEPTION 'Tournament points are in an inconsistent state' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT p_tournament_id, array_length(v_confirmed_ids, 1), v_existing_movements, true;
    RETURN;
  END IF;

  IF v_existing_movements > 0 THEN
    RAISE EXCEPTION 'Tournament points are in an inconsistent state' USING ERRCODE = '22023';
  END IF;

  FOR v_entry_id IN SELECT unnest(v_confirmed_ids) AS x ORDER BY x LOOP
    SELECT * INTO v_entry FROM public.tournament_entries AS te WHERE te.id = v_entry_id;

    SELECT array_agg(tem.club_member_id ORDER BY tem.club_member_id) INTO v_member_ids
    FROM public.tournament_entry_members AS tem
    WHERE tem.tournament_entry_id = v_entry_id AND tem.is_active = true;

    IF v_member_ids IS NULL OR array_length(v_member_ids, 1) <> 2 THEN
      RAISE EXCEPTION 'A confirmed entry does not have exactly two active members' USING ERRCODE = '22023';
    END IF;

    FOREACH v_member_id IN ARRAY v_member_ids LOOP
      SELECT * INTO v_state FROM public.club_member_sport_state AS s WHERE s.club_member_id = v_member_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Player has no sport state yet' USING ERRCODE = 'P0002';
      END IF;
      IF v_state.club_id <> v_tournament.club_id THEN
        RAISE EXCEPTION 'Sport state does not belong to this club' USING ERRCODE = '22023';
      END IF;

      SELECT c.category INTO v_category FROM public.club_ranking_cycles AS c WHERE c.id = v_state.cycle_id;

      v_new_total := v_state.current_points + v_entry.points;

      UPDATE public.club_member_sport_state AS s
      SET current_points = v_new_total, points_reached_at = now()
      WHERE s.club_member_id = v_member_id;

      INSERT INTO public.club_player_point_movements (
        club_id, club_member_id, cycle_id, category,
        previous_total, new_total, delta,
        adjustment_mode, origin, system_event_code, tournament_id, comment, created_by
      ) VALUES (
        v_tournament.club_id, v_member_id, v_state.cycle_id, v_category,
        v_state.current_points, v_new_total, v_entry.points,
        'delta', 'system', 'tournament_points', p_tournament_id, 'Puntos de torneo', auth.uid()
      );

      v_movement_count := v_movement_count + 1;
    END LOOP;
  END LOOP;

  UPDATE public.tournaments AS t
  SET status = 'completed', completed_at = now(), completed_by = auth.uid()
  WHERE t.id = p_tournament_id AND t.status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT p_tournament_id, array_length(v_confirmed_ids, 1), v_movement_count, false;
END;
$$;

-- create_club_news
CREATE OR REPLACE FUNCTION public.create_club_news(
  p_club_id       uuid,
  p_title         text,
  p_content       text,
  p_image_url     text,
  p_tournament_id uuid
)
RETURNS TABLE (
  id            uuid,
  club_id       uuid,
  title         text,
  slug          text,
  content       text,
  image_url     text,
  created_by    uuid,
  tournament_id uuid,
  published_at  timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_title          text;
  v_content        text;
  v_image_url      text;
  v_tournament     public.tournaments%ROWTYPE;
  v_base_slug      text;
  v_candidate_slug text;
  v_date_part      text;
  v_suffix         int := 0;
  v_constraint     text;
  v_news           public.club_news%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, p_club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(p_club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to publish news for this club' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to publish news for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  v_title := btrim(COALESCE(p_title, ''));
  IF length(v_title) < 3 THEN
    RAISE EXCEPTION 'Title must be at least 3 characters' USING ERRCODE = '22023';
  END IF;

  v_content := btrim(COALESCE(p_content, ''));
  IF v_content = '' THEN
    RAISE EXCEPTION 'Content is required' USING ERRCODE = '22023';
  END IF;

  v_image_url := btrim(COALESCE(p_image_url, ''));
  IF v_image_url = '' THEN
    RAISE EXCEPTION 'Image is required' USING ERRCODE = '22023';
  END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id AND t.club_id = p_club_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tournament not found for this club' USING ERRCODE = 'P0002';
    END IF;
    IF v_tournament.status <> 'completed' THEN
      RAISE EXCEPTION 'Tournament must be completed to generate its news' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.club_news WHERE tournament_id = p_tournament_id) THEN
      RAISE EXCEPTION 'This tournament already has a published news item' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_base_slug := COALESCE(public._slugify_tournament_name(v_title), 'noticia');
  v_candidate_slug := v_base_slug;

  LOOP
    BEGIN
      INSERT INTO public.club_news AS cn (club_id, title, slug, content, image_url, created_by, tournament_id)
      VALUES (p_club_id, v_title, v_candidate_slug, v_content, v_image_url, auth.uid(), p_tournament_id)
      RETURNING * INTO v_news;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      IF v_constraint = 'club_news_one_per_tournament' THEN
        RAISE EXCEPTION 'This tournament already has a published news item' USING ERRCODE = '22023';
      END IF;
      IF v_constraint <> 'club_news_club_id_slug_key' THEN
        RAISE;
      END IF;

      IF v_suffix = 0 THEN
        v_date_part := to_char(now(), 'YYYYMMDD');
        v_candidate_slug := v_base_slug || '-' || v_date_part;
        v_suffix := 2;
      ELSE
        v_candidate_slug := v_base_slug || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END IF;

      IF v_suffix > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique news slug after multiple attempts' USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT
    v_news.id, v_news.club_id, v_news.title, v_news.slug, v_news.content, v_news.image_url,
    v_news.created_by, v_news.tournament_id, v_news.published_at, v_news.created_at, v_news.updated_at;
END;
$$;

-- adjust_club_player_points
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

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, p_club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(p_club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

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

  SELECT c.category INTO v_category
  FROM public.club_ranking_cycles AS c WHERE c.id = v_state.cycle_id;

  v_new_total := GREATEST(v_state.current_points + p_delta_points, 0);

  IF v_new_total = v_state.current_points THEN
    RAISE EXCEPTION 'Adjustment results in no change to current points' USING ERRCODE = '22023';
  END IF;

  UPDATE public.club_member_sport_state AS s
  SET current_points = v_new_total,
      points_reached_at = now()
  WHERE s.club_member_id = p_club_member_id;

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

-- change_club_player_category
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

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, p_club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(p_club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to change category in this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to change category in this club' USING ERRCODE = '42501';
  END IF;

  IF p_change_type IS NULL
     OR p_change_type NOT IN ('promotion', 'demotion', 'correction')
  THEN
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

  SELECT c.category, sc.sort_order INTO v_previous_category, v_previous_sort
  FROM public.club_ranking_cycles c
  JOIN public.sport_categories sc ON sc.code = c.category
  WHERE c.id = v_state.cycle_id;

  IF p_target_category = v_previous_category THEN
    RAISE EXCEPTION 'Target category is the same as the current category' USING ERRCODE = '22023';
  END IF;

  IF p_change_type = 'promotion' AND v_target_sort <= v_previous_sort THEN
    RAISE EXCEPTION 'promotion requires a higher category order than the current one' USING ERRCODE = '22023';
  END IF;

  IF p_change_type = 'demotion' AND v_target_sort >= v_previous_sort THEN
    RAISE EXCEPTION 'demotion requires a lower category order than the current one' USING ERRCODE = '22023';
  END IF;

  SELECT r.ranking_position INTO v_previous_position
  FROM public.get_club_category_ranking(p_club_id, v_previous_category) AS r
  WHERE r.club_member_id = p_club_member_id;

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
