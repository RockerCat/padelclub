-- ============================================================
-- Club archival — Phase 8
-- Mi Pádel Club
-- ============================================================
-- OWNER-only, reversible-in-a-future-phase retirement of a club: stops new
-- operations (reservations, join requests, invitation claims) and drops
-- the club from public discovery, while preserving every row of history
-- untouched (members, reservations, pricing, branding, etc.).
--
-- Model: a single new nullable column, clubs.archived_at timestamptz.
-- Archived when NOT NULL, active when NULL. clubs.is_active already
-- exists but is a different, currently-unused concept reserved for a
-- future platform-level (SUPERADMIN) suspend/reactivate toggle (see the
-- disabled "Activar/Desactivar club" button in /platform/clubs/[clubId])
-- — reusing it here would silently hand that separate, not-yet-built
-- capability new meaning without an explicit policy for it, which the
-- task this migration implements explicitly rules out. archived_at is
-- therefore additive and orthogonal to is_active; nothing about is_active
-- changes in this migration.
-- ============================================================

ALTER TABLE public.clubs
  ADD COLUMN archived_at timestamptz;

-- ─── Public discovery / public profile: archived clubs disappear ──────────
-- Same policy name/shape as before (20260615000006), only the USING clause
-- gains an archived_at check. clubs_select_own_member (members can always
-- read their own club) is untouched on purpose — an archived club must
-- stay readable for its own OWNER/ADMIN/PLAYER members (read-only
-- navigation, history, banners), only anonymous/non-member discovery is
-- closed off here.
DROP POLICY IF EXISTS "clubs_select_active" ON public.clubs;

CREATE POLICY "clubs_select_active"
  ON public.clubs FOR SELECT
  USING (is_active = true AND archived_at IS NULL);


-- ─── Private helper: the one place every gated RPC below checks archival ──
CREATE OR REPLACE FUNCTION public._require_club_not_archived(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.clubs WHERE id = p_club_id AND archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Este club se encuentra archivado.' USING ERRCODE = 'P0005';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._require_club_not_archived(uuid) FROM PUBLIC;


-- ─── archive_club — the operation itself ───────────────────────────────────
-- OWNER of the club only. Validates, in order: authenticated, active OWNER
-- membership of p_club_id (via club_role, which also implies the club
-- exists — club_members.club_id has an FK to clubs(id)), not already
-- archived. FOR UPDATE row-locks the clubs row so two concurrent OWNER
-- calls serialize: the loser sees archived_at already set and fails with
-- 22023, exactly like the rest of this codebase's double-click/race guards
-- (leave_club, deactivate_player, approve_pending_reservation). Sets only
-- clubs.archived_at — no other column, no cascading writes to members,
-- reservations, pricing, or anything else; those are explicitly meant to
-- stay untouched (see CLAUDE.md → Club Archival Principles). Notifies
-- every active member of the club (any role, including the acting OWNER),
-- matching leave_club/join_public_club's existing "fused inline INSERT
-- ... SELECT FROM club_members" broadcast convention rather than a
-- separate notify_* RPC.
CREATE OR REPLACE FUNCTION public.archive_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role          text;
  v_club_name     text;
  v_club_slug     text;
  v_archived_at   timestamptz;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_role := public.club_role(p_club_id);
  IF v_role IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'Only the OWNER can archive this club' USING ERRCODE = '42501';
  END IF;

  SELECT name, slug, archived_at INTO v_club_name, v_club_slug, v_archived_at
  FROM public.clubs
  WHERE id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Club already archived' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clubs SET archived_at = now() WHERE id = p_club_id AND archived_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Club already archived' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'club_archived',
    'Club archivado',
    'El club ' || COALESCE(v_club_name, '') || ' ha sido archivado y ya no acepta nuevas operaciones.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'destination', '/' || v_club_slug
    )
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_club(uuid) TO authenticated;


-- ============================================================
-- Gate every operation that would create a NEW commitment against an
-- archived club. Cancelling/rejecting an existing reservation or request
-- is deliberately left alone everywhere below — those only ever release a
-- slot/resolve something already pending, never claim new occupancy, and
-- CLAUDE.md's archival principles only require blocking new operations.
-- ============================================================

-- ─── Reservations: create (player/admin), edit, approve ───────────────────
-- Each of the four RPCs below is reproduced in full (CREATE OR REPLACE)
-- from supabase/migrations/20260814000001_update_reservation.sql, with
-- exactly one addition each: an early
-- PERFORM public._require_club_not_archived(...) call, placed right after
-- the existing membership/role check and before any other business rule,
-- so an archived club fails fast with a distinguishable error
-- (ERRCODE P0005) before any lock is taken or any other validation runs.
-- No other line changes.

CREATE OR REPLACE FUNCTION public.create_reservation_player(
  p_club_id uuid,
  p_court_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_hours_error   text;
  v_has_conflict  boolean;
  v_price         record;
  v_new_start_at  timestamptz;
  v_reservation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.club_role(p_club_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

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
    p_court_id, p_date, p_start_time, p_duration_minutes, NULL, ARRAY['pending', 'confirmed']
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  SELECT * INTO v_price FROM public._resolve_reservation_price(
    p_club_id, p_court_id, p_date, p_start_time, p_duration_minutes
  );
  IF NOT v_price.o_matched THEN
    RAISE EXCEPTION 'No pricing rule configured for this time' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.reservations (
    club_id, court_id, created_by, date, start_time, duration_minutes, type, status,
    price_amount, price_currency, pricing_rule_id, price_calculated_at
  ) VALUES (
    p_club_id, p_court_id, auth.uid(), p_date, p_start_time, p_duration_minutes, 'match', 'pending',
    v_price.o_price_amount, v_price.o_price_currency, v_price.o_pricing_rule_id, now()
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer) TO authenticated;


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

  IF public.club_role(p_club_id) NOT IN ('OWNER', 'ADMIN') THEN
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

REVOKE ALL ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text) TO authenticated;


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

  -- club_role() already scopes to THIS reservation's club and requires
  -- is_active = true.
  v_role := public.club_role(v_reservation.club_id);

  IF v_role IN ('OWNER', 'ADMIN') THEN
    NULL; -- operational edit, no 2-hour window
  ELSIF v_role = 'PLAYER' THEN
    IF v_reservation.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Only the creator can edit this reservation' USING ERRCODE = '42501';
    END IF;

    IF v_reservation.type = 'block' THEN
      RAISE EXCEPTION 'A PLAYER cannot edit a block reservation' USING ERRCODE = '42501';
    END IF;

    -- Same wall-clock instant convention as cancel_reservation
    -- (20260811000002): the CURRENT start time, not the requested new one
    -- — "inicio actual de la reserva - now() >= interval '2 hours'".
    v_current_start_at := (v_reservation.date + v_reservation.start_time) AT TIME ZONE 'America/Bogota';
    IF v_current_start_at - now() < interval '2 hours' THEN
      RAISE EXCEPTION 'Cannot edit within 2 hours of the reservation start time' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to edit this reservation' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_reservation.club_id);

  -- ─── New values must satisfy every rule reservation creation already
  -- enforces ──────────────────────────────────────────────────────────────

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

  -- Only the DESTINATION slot is locked — see the header comment for why
  -- this is sufficient even when court and/or date both change, and why
  -- it can never deadlock (at most one lock per transaction, always).
  PERFORM public._lock_court_date(p_court_id, p_date);

  -- PLAYER's own create flow blocks against both pending AND confirmed;
  -- the admin create/edit flow only ever blocked against confirmed — both
  -- existing behaviors preserved here rather than unified into one rule.
  v_has_conflict := public._check_reservation_conflict(
    p_court_id, p_date, p_start_time, p_duration_minutes, p_reservation_id,
    CASE WHEN v_role = 'PLAYER' THEN ARRAY['pending','confirmed'] ELSE ARRAY['confirmed'] END
  );
  IF v_has_conflict THEN
    RAISE EXCEPTION 'Requested time conflicts with an existing reservation' USING ERRCODE = '23P01';
  END IF;

  -- ─── Resulting status / price ──────────────────────────────────────────
  v_fields_changed := (
    p_court_id <> v_reservation.court_id
    OR p_date <> v_reservation.date
    OR p_start_time <> v_reservation.start_time
    OR p_duration_minutes <> v_reservation.duration_minutes
  );

  IF v_role IN ('OWNER', 'ADMIN') THEN
    -- Operational edit — status is never touched, exactly like the prior
    -- direct updateReservation.
    UPDATE public.reservations
    SET court_id = p_court_id, date = p_date, start_time = p_start_time, duration_minutes = p_duration_minutes
    WHERE id = p_reservation_id AND status = v_reservation.status;
  ELSE
    IF v_reservation.status = 'pending' OR NOT v_fields_changed THEN
      v_new_status := v_reservation.status;
    ELSE
      -- Was confirmed and the schedule actually changed — reuses the exact
      -- rule requestReservation already applies to every new request
      -- (there is no auto-approval policy anywhere in this codebase):
      -- needs fresh review.
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

REVOKE ALL ON FUNCTION public.update_reservation(uuid, uuid, date, time, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_reservation(uuid, uuid, date, time, integer) TO authenticated;


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

  v_role := public.club_role(v_reservation.club_id);
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

  -- Same shared lock every create/edit path takes for this exact
  -- court+day (see the file header comment for the deadlock-freedom
  -- argument — this call also acquires at most one lock).
  PERFORM public._lock_court_date(v_reservation.court_id, v_reservation.date);

  -- Re-check status AFTER acquiring the lock — another admin could have
  -- approved or rejected this exact request while this call was waiting
  -- for a lock held by an unrelated create/edit for the same court+day.
  IF NOT EXISTS (
    SELECT 1 FROM public.reservations WHERE id = p_reservation_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;

  -- Confirmed-only, excluding this reservation's own row — identical
  -- semantics to the previous checkOverlap-based check ("PENDING doesn't
  -- block itself").
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

REVOKE ALL ON FUNCTION public.approve_pending_reservation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pending_reservation(uuid) TO authenticated;


-- ─── join_public_club — instant join now also requires not-archived ───────
-- Same function as before (20260809000001), only the existing club lookup
-- gains "AND archived_at IS NULL" — an archived club already reads as
-- "not found or inactive" (P0002), the same outcome a caller already
-- handles today for a plain deactivated club, no new error code needed.
CREATE OR REPLACE FUNCTION public.join_public_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_visibility      text;
  v_already_member  boolean;
  v_account_type    text;
  v_club_name       text;
  v_club_slug       text;
  v_player_name     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT visibility INTO v_visibility
  FROM public.clubs
  WHERE id = p_club_id AND is_active = true AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  IF v_visibility != 'public' THEN
    RAISE EXCEPTION 'Club is not open for public joining' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND profile_id = auth.uid()
      AND is_active = true
  ) INTO v_already_member;

  IF v_already_member THEN
    RETURN;
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This account cannot join as a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (p_club_id, auth.uid(), 'PLAYER', true);

  UPDATE public.profiles SET account_type = 'PLAYER' WHERE id = auth.uid() AND account_type IS NULL;

  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;
  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'player_joined_public_club',
    'Nuevo jugador en el club',
    COALESCE(v_player_name, 'Un jugador') || ' se unió a ' || COALESCE(v_club_name, 'tu club') || '.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'player_profile_id', auth.uid(),
      'destination', '/' || v_club_slug || '/admin/players'
    )
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_public_club(uuid) TO authenticated;


-- ─── create_join_request — private-club requests also require not-archived ─
-- Same function as before (20260809000001), with one addition: an early
-- archived check (ERRCODE P0005), right after the OWNER/ADMIN
-- account-type guard, before any club_join_requests row can be created.
CREATE OR REPLACE FUNCTION public.create_join_request(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_existing        public.club_join_requests;
  v_club_name       text;
  v_club_slug       text;
  v_requester_name  text;
  v_request_id      uuid;
  v_account_type    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This account cannot request to join as a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Already a member' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_existing
  FROM public.club_join_requests
  WHERE club_id = p_club_id AND profile_id = auth.uid();

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      RETURN; -- no-op: already pending, not a duplicate
    ELSIF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Already a member' USING ERRCODE = '23505';
    ELSE
      RAISE EXCEPTION 'Previously rejected' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.club_join_requests (club_id, profile_id, status)
  VALUES (p_club_id, auth.uid(), 'pending')
  RETURNING id INTO v_request_id;

  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'join_request_created',
    'Nueva solicitud de ingreso',
    COALESCE(v_requester_name, 'Un usuario') || ' quiere unirse a ' || COALESCE(v_club_name, 'tu club') || '.',
    jsonb_build_object(
      'club_id', p_club_id,
      'club_slug', v_club_slug,
      'join_request_id', v_request_id,
      'requester_profile_id', auth.uid(),
      'destination', '/' || v_club_slug || '/admin/players'
    )
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_join_request(uuid) TO authenticated;


-- ─── approve_join_request — approving into an archived club is blocked ────
-- Same function as before (20260809000001), with one addition: an early
-- archived check (ERRCODE P0005) right after the OWNER/ADMIN authorization
-- check, before the club_members INSERT. reject_join_request is
-- untouched — rejecting a request never creates new occupancy/membership.
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

  IF public.club_role(v_request.club_id) NOT IN ('OWNER', 'ADMIN') THEN
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

REVOKE ALL ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;


-- ─── claim_invitation — accepting an ADMIN invite into an archived club ───
-- Same function as before (20260810000001), with one addition: v_club_slug
-- is now fetched together with archived_at, and a NEW membership claim
-- (i.e. past the already-member short-circuit, which stays a harmless
-- no-op regardless of archival, and past the player-invites-retired
-- check) is rejected with error 'club_archived' before the club_members
-- INSERT.
CREATE OR REPLACE FUNCTION public.claim_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link          invitation_links%ROWTYPE;
  v_club_slug     text;
  v_archived_at   timestamptz;
  v_existing      int;
  v_account_type  text;
  v_has_history   boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_link
  FROM   invitation_links
  WHERE  token     = p_token
    AND  is_active = true
    AND  expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF v_link.max_uses IS NOT NULL AND v_link.uses >= v_link.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'max_uses_reached');
  END IF;

  SELECT slug, archived_at INTO v_club_slug, v_archived_at FROM clubs WHERE id = v_link.club_id;

  SELECT count(*) INTO v_existing
  FROM   club_members
  WHERE  club_id    = v_link.club_id
    AND  profile_id = auth.uid();

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug, 'already_member', true);
  END IF;

  -- Not yet a member — this token would have to create a NEW membership.
  -- Player invitations are retired: the only real invitation left is ADMIN.
  IF v_link.role != 'ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'error', 'player_invites_retired');
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'club_archived');
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();

  SELECT EXISTS (
    SELECT 1 FROM public.club_members WHERE profile_id = auth.uid()
  ) INTO v_has_history;

  IF v_account_type IS NOT NULL OR v_has_history THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_requires_no_history');
  END IF;

  INSERT INTO club_members (club_id, profile_id, role, is_active)
  VALUES (v_link.club_id, auth.uid(), v_link.role, true);

  UPDATE public.profiles SET account_type = v_link.role WHERE id = auth.uid() AND account_type IS NULL;

  UPDATE invitation_links
  SET    uses = uses + 1
  WHERE  id   = v_link.id;

  RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug, 'already_member', false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invitation(text) TO authenticated;


-- ─── get_invitation_preview — previews an archived club's link as invalid ──
-- Same shape as before (20260810000001), with one addition: `valid` also
-- requires the club not to be archived, and a new `archived` field is
-- exposed so /invite/[token] can show a specific, honest reason instead of
-- falling back to a generic "revoked" message.
CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link  invitation_links%ROWTYPE;
  v_club  clubs%ROWTYPE;
BEGIN
  SELECT * INTO v_link
  FROM   invitation_links
  WHERE  token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_club FROM clubs WHERE id = v_link.club_id;

  RETURN jsonb_build_object(
    'valid',            v_link.role = 'ADMIN'
                          AND v_link.is_active
                          AND v_link.expires_at > now()
                          AND (v_link.max_uses IS NULL OR v_link.uses < v_link.max_uses)
                          AND v_club.archived_at IS NULL,
    'is_active',        v_link.is_active,
    'expired',          v_link.expires_at <= now(),
    'max_uses_reached', v_link.max_uses IS NOT NULL AND v_link.uses >= v_link.max_uses,
    'archived',         v_club.archived_at IS NOT NULL,
    'role',             v_link.role,
    'expires_at',       v_link.expires_at,
    'club_name',        v_club.name,
    'club_slug',        v_club.slug,
    'club_logo_url',    v_club.logo_url,
    'primary_color',    v_club.primary_color,
    'secondary_color',  v_club.secondary_color
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_preview(text) TO anon, authenticated;
