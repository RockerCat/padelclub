-- ============================================================
-- Deactivate a PLAYER from a club — Phase 6
-- Mi Pádel Club
-- ============================================================
-- Official rule: only OWNER/ADMIN of the same club may deactivate a
-- PLAYER's membership. Never PLAYER, never a member of another club,
-- never an already-inactive membership. Only a target whose role is
-- PLAYER may be deactivated this way — never OWNER, ADMIN, or SUPERADMIN
-- (SUPERADMIN can never hold a club_members row at all, so it's already
-- structurally excluded). account_type is never touched — the profile
-- stays globally PLAYER even with zero active clubs.
--
-- Before this migration, toggleMemberActive (admin/players/actions.ts)
-- BLOCKED deactivation outright whenever the target had any active
-- reservation, rather than resolving them — that check is removed here
-- and replaced by this RPC's own cleanup (own future reservations
-- cancelled, participation in others' future reservations removed),
-- mirroring leave_club (20260812000001, Phase 5) exactly, since both
-- flows share the identical "end a PLAYER's membership in this club"
-- cleanup rules. The two operations are NOT unified behind a shared SQL
-- helper: leave_club is an already-applied migration that must not be
-- touched, and a helper with only one real caller (this function) would
-- add a new privileged internal surface for no real deduplication
-- benefit — so this function inlines the same logic, consistent in
-- shape/fields/timezone convention with leave_club, rather than sharing
-- code with it.
--
-- Single difference from leave_club's own cleanup: cancelled_at/
-- cancelled_by on the player's own cancelled reservations record the
-- ACTING OWNER/ADMIN (auth.uid()), never the deactivated player — this is
-- an operational cancellation by the club, not the player's own
-- voluntary one, and the 2-hour PLAYER cancellation window never applies
-- here (mirrors leave_club's own reasoning: a membership-ending operation
-- must not be able to strand a stray active reservation, and
-- cancel_reservation is never called or weakened to achieve this — the
-- state transition is reimplemented inline here exactly as leave_club
-- already does it for the same reason).
--
-- Order (mandatory, all inside this one function call/transaction — any
-- real error rolls back everything already done in this call):
--   1. authenticated;
--   2. executor has an active membership in p_club_id;
--   3. executor's role is OWNER or ADMIN;
--   4. target exists as an active member of the same club;
--   5. target's role is PLAYER;
--   6. target is not the executor;
--   7. target profile's account_type is PLAYER (defense-in-depth,
--      consistent with the club_members role already checked);
--   8. cancel every future pending/confirmed non-block reservation the
--      target created, cancelled_by = the executor, then
--      notify_reservation_cancelled per cancelled reservation;
--   9. remove the target's own reservation_players row from every future
--      pending/confirmed non-block reservation created by someone else,
--      notifying that reservation's creator (reservation_participant_left
--      — same notification Phase 5 already introduced for the identical
--      "player stops participating in someone else's future reservation"
--      case);
--  10. deactivate club_members via an atomic
--      UPDATE ... WHERE is_active = true + ROW_COUNT check — a genuine
--      double-click or two-admins-at-once race leaves exactly one caller
--      succeeding, the other cleanly rejected (22023), never a double
--      notification;
--  11. notify the deactivated player (player_deactivated) — only once the
--      atomic deactivation above actually succeeded this call;
--  12. done.
--
-- type != 'block' exclusion on both reservation loops: block reservations
-- are only ever created by OWNER/ADMIN through the admin reservation form
-- (ReservationForm.tsx only offers "Bloqueo" there; requestReservation,
-- the PLAYER-facing path, hardcodes type: "match"), but the DB itself
-- doesn't forbid a PLAYER from inserting a pending reservations row with
-- type='block' via the generic "members insert pending reservations" RLS
-- policy (club_role(club_id) IS NOT NULL, no type restriction) — the same
-- gap leave_club already defends against defensively, reused here rather
-- than trusting the app-level convention alone.
-- ============================================================

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

  -- club_role() already scopes to p_club_id and already requires
  -- is_active = true — covers "executor has an active membership" and
  -- gives NULL for a non-member, someone active only in a different club,
  -- or (structurally) a SUPERADMIN, who never holds any club_members row.
  v_executor_role := public.club_role(p_club_id);
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

  -- ─── Own future reservations — cancel in full, executor is the canceller ──
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

  -- ─── Participation in others' future reservations — remove only that row ──
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

  -- ─── Deactivate the membership ─────────────────────────────────────────
  UPDATE public.club_members
  SET is_active = false
  WHERE club_id = p_club_id AND profile_id = p_player_id AND is_active = true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Already deactivated' USING ERRCODE = '22023';
  END IF;

  -- ─── Notify the deactivated player ─────────────────────────────────────
  -- Never "eliminación de cuenta" language — this is a club-scoped access
  -- change, the profile and account_type are untouched.
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

REVOKE ALL ON FUNCTION public.deactivate_player(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_player(uuid, uuid) TO authenticated;
