-- ============================================================
-- Voluntary club leave — Phase 5
-- Mi Pádel Club
-- ============================================================
-- Official rule: only a PLAYER can voluntarily leave a club. OWNER never
-- uses this (leaving is only ever possible via a future ownership
-- transfer, out of MVP scope); ADMIN never uses this either (an ADMIN only
-- ever stops belonging to a club via a future OWNER-driven deactivation,
-- also out of scope here).
--
-- club_members_update (20260610000001) has no self-service branch at all
-- — its USING clause only ever passes for the caller's own OWNER/ADMIN
-- role in that club — and the Phase-1 hardening migration
-- (20260809000001) explicitly narrowed the column grant + stated the
-- official decision: "membership rows may only ever be created,
-- reactivated, or role-changed through a SECURITY DEFINER RPC." A PLAYER
-- has no existing path to flip their own is_active at all, so this is a
-- new RPC, not a raw client update.
--
-- Nothing is ever deleted except future reservation_players participation
-- rows the leaving player themselves held (see step 4 below) — every
-- reservation row, every notification, every historical row, and the
-- club_members row itself are all preserved (is_active goes false, never
-- deleted).
--
-- Reservation treatment (two distinct cases, corrected after review):
--   - A reservation the leaving PLAYER created (reservations.created_by)
--     is cancelled in full — same status/cancelled_at/cancelled_by fields
--     and the same notify_reservation_cancelled call a normal cancellation
--     produces — regardless of the 2-hour window: leaving a club is a
--     membership-termination operation, not the player individually
--     choosing to cancel one booking from the reservations UI, and must
--     not strand them with an uncancellable future commitment at a club
--     they're no longer part of. This is done WITHOUT calling
--     public.cancel_reservation (that RPC's 2-hour rule for a PLAYER
--     caller is real security/business logic, not a bug to route around
--     here) — the same atomic UPDATE ... WHERE status IN (...) + audit
--     fields + notify pattern is instead reimplemented directly inside
--     this SECURITY DEFINER function, which is not itself callable by
--     `authenticated` with a club_id the caller doesn't actually hold an
--     active PLAYER membership in (validated at the top), and takes no
--     client-supplied override of any kind. cancel_reservation itself is
--     completely untouched by this migration — its own 2-hour rule still
--     fully applies to every ordinary cancellation initiated from the
--     reservations UI.
--   - A reservation created by someone else where the leaving PLAYER only
--     appears in reservation_players is never cancelled on their account —
--     a mere participant leaving the club must never indirectly cancel
--     another member's reservation. Only their own reservation_players row
--     is removed, and only while the reservation is still genuinely in the
--     future (its start time hasn't arrived yet) — a reservation that's
--     already started or finished keeps its full historical participant
--     list untouched, since that's real match/participation history, not a
--     future commitment to unwind. The reservation's creator is notified
--     (reservation_participant_left), the reservation itself, its other
--     participants, and its status are all left exactly as they were.
--
-- Order of operations (mandatory — a partially-updated state must never be
-- left behind; any real error propagates and rolls back everything this
-- function call has done so far, since it all runs inside one function
-- invocation/transaction):
--   1. validate auth.uid(), profiles.account_type = 'PLAYER', an ACTIVE
--      club_members row for this club, and that row's role = 'PLAYER'
--      (never OWNER/ADMIN);
--   2. locate every reservation in this club the player themselves
--      created that's still pending/confirmed and not a court-block;
--   3. cancel each one in place (atomic UPDATE ... WHERE status IN (...) +
--      GET DIAGNOSTICS, same idiom cancel_reservation itself uses) even if
--      it starts within 2 hours, then call notify_reservation_cancelled —
--      a reservation already resolved by someone else concurrently
--      (ROW_COUNT = 0) is skipped without error or a duplicate
--      notification, since the desired end state already holds;
--   4. locate every reservation of another creator in this club where the
--      player only participates (reservation_players), still
--      pending/confirmed, not a court-block, and still genuinely in the
--      future;
--   5. remove only the player's own reservation_players row for each
--      (atomic DELETE + GET DIAGNOSTICS — a row already removed
--      concurrently is skipped without error or a duplicate
--      notification), then notify that reservation's creator;
--   6. deactivate the membership via the same atomic
--      UPDATE ... WHERE is_active = true + ROW_COUNT idiom used above — a
--      genuine double-click/two-simultaneous-calls race leaves exactly one
--      caller succeeding and the other cleanly rejected (22023), never a
--      double notification;
--   7. notify every active OWNER/ADMIN of the club that the player left —
--      fused directly into this same function (not a separate notify_*
--      RPC), matching join_public_club/create_join_request's convention
--      for membership events;
--   8. done.
-- ============================================================

CREATE OR REPLACE FUNCTION public.leave_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_account_type     text;
  v_membership       public.club_members;
  v_reservation_id   uuid;
  v_participant_row  RECORD;
  v_updated_count    int;
  v_player_name      text;
  v_club_name        text;
  v_club_slug        text;
  v_court_name       text;
  v_date_label       text;
  v_creator_role     text;
  v_destination      text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IS DISTINCT FROM 'PLAYER' THEN
    RAISE EXCEPTION 'Only a PLAYER account can voluntarily leave a club' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_membership
  FROM public.club_members
  WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not an active member of this club' USING ERRCODE = 'P0002';
  END IF;

  IF v_membership.role != 'PLAYER' THEN
    RAISE EXCEPTION 'OWNER/ADMIN memberships cannot use voluntary leave' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = auth.uid();
  SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = p_club_id;

  -- ─── Steps 2-3: reservations the leaving player created ──────────────────
  -- Cancelled in full, even within 2 hours — see the header comment for
  -- why this is reimplemented inline rather than through
  -- public.cancel_reservation.
  FOR v_reservation_id IN
    SELECT r.id FROM public.reservations r
    WHERE r.club_id = p_club_id
      AND r.created_by = auth.uid()
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

  -- ─── Steps 4-5: reservations of another creator the player only
  -- participates in ──────────────────────────────────────────────────────
  -- Never cancelled — only the player's own reservation_players row is
  -- removed, and only while the reservation is still genuinely in the
  -- future (matching cancel_reservation's own "wall-clock instant in
  -- Colombia's one operative timezone" convention, 20260811000002).
  FOR v_participant_row IN
    SELECT r.id AS reservation_id, r.created_by AS creator_id, r.date, r.start_time,
           r.duration_minutes, r.court_id
    FROM public.reservations r
    JOIN public.reservation_players rp ON rp.reservation_id = r.id
    WHERE r.club_id = p_club_id
      AND rp.profile_id = auth.uid()
      AND r.created_by != auth.uid()
      AND r.status IN ('pending', 'confirmed')
      AND r.type != 'block'
      AND (r.date + r.start_time) AT TIME ZONE 'America/Bogota' > now()
  LOOP
    DELETE FROM public.reservation_players
    WHERE reservation_id = v_participant_row.reservation_id AND profile_id = auth.uid();

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      CONTINUE; -- already removed concurrently — nothing to notify
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
      COALESCE(v_player_name, 'Un jugador') || ' salió del club y ya no participará en tu reserva en ' ||
        COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_participant_row.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_participant_row.start_time + (v_participant_row.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
      jsonb_build_object(
        'club_id', p_club_id,
        'club_slug', v_club_slug,
        'reservation_id', v_participant_row.reservation_id,
        'former_participant_profile_id', auth.uid(),
        'destination', v_destination
      )
    );
  END LOOP;

  -- ─── Step 6: deactivate the membership ────────────────────────────────
  UPDATE public.club_members
  SET is_active = false
  WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Already left this club' USING ERRCODE = '22023';
  END IF;

  -- ─── Step 7: notify every active OWNER/ADMIN ──────────────────────────
  -- Fused inline, same shape as join_public_club's own notification insert
  -- — the established convention for membership events.
  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'player_left_club',
    'Un jugador salió del club',
    COALESCE(v_player_name, 'Un jugador') || ' salió de ' || COALESCE(v_club_name, 'tu club') || '.',
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

REVOKE ALL ON FUNCTION public.leave_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_club(uuid) TO authenticated;
