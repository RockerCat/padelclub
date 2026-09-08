-- ============================================================
-- delete_own_account() — self-service account deletion (DB side)
-- Mi Pádel Club
-- ============================================================
-- Store-compliance requirement (Apple 5.1.1(v) / Google Play): users must
-- be able to delete their account. A literal cascading hard DELETE of
-- auth.users/profiles is not executable against this schema — club_members
-- is anchored by several composite FKs (club_member_sport_state,
-- club_player_point_movements, club_player_category_changes,
-- tournament_entry_members, all keyed on club_members(id, club_id)) that
-- are deliberately NO ACTION, by explicit design (see their own migration
-- comments, 20260820000001/20260906000001) — that history must never
-- silently disappear. A real DELETE would fail with a foreign-key
-- violation for virtually any account with real usage.
--
-- So this is "delete + anonymize", never a hard delete:
--   - every active PLAYER club_members row is deactivated (never deleted)
--     and gets the exact same future-commitment cleanup leave_club already
--     performs per club (20261031000001), just looped across every club
--     the caller belongs to instead of one;
--   - every active ADMIN club_members row is deactivated the same minimal
--     way the existing OWNER-initiated removeAdmin action already does it
--     (src/app/(app)/[club]/admin/team/actions.ts) — a bare is_active =
--     false, nothing else. An ADMIN's created_by on a reservation is
--     administrative authorship, never personal participation (see Sport/
--     Ranking Module Principles), so the PLAYER-only reservation/
--     participation cleanup below never applies to an ADMIN row;
--   - an active OWNER membership blocks deletion outright (see guard
--     below) — never deactivated by this function;
--   - push_tokens/notifications/pending join requests (purely personal,
--     ephemeral) are deleted outright;
--   - profiles is anonymized in place (full_name/phone/avatar_url), never
--     deleted — its id remains the FK anchor for every historical
--     reservation/ranking/tournament/news row, which is why every one of
--     those already-existing joins to profiles.full_name/avatar_url
--     automatically renders "Usuario eliminado" afterward with zero other
--     code changes anywhere in the app.
--
-- auth.users itself is never touched here — Postgres has no access to the
-- separate GoTrue Auth service from SQL. Disabling login, scrubbing the
-- real email, and clearing user_metadata happen in the delete-account Edge
-- Function (supabase/functions/delete-account), via the Admin API, after
-- this function returns successfully.
--
-- Reused verbatim from leave_club (20261031000001): the reservation-
-- cancellation loop, the participant-removal loop (future only, America/
-- Bogota wall-clock), the OWNER/ADMIN notification on departure, and the
-- notify_reservation_cancelled/_reject_pending_reservation_join_requests/
-- _maybe_reopen_reservation helper calls — never a second, slightly
-- different implementation of the same business rule.
--
-- OWNER is a deliberate, permanent blocker, not a gap: every club has
-- exactly one active OWNER at all times, by construction (create_club_
-- with_owner inserts exactly one at creation; claim_club, the only other
-- function that ever inserts an OWNER row, locks and asserts exactly one
-- active OWNER both before and after — see its own v_owner_count != 1
-- guard, 20261005000001). No ownership-transfer/demotion mechanism exists
-- anywhere in this codebase, and building one is explicitly out of scope
-- here — an active OWNER must resolve that outside the app (see
-- /delete-account) before they can delete their account.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_player_name      text;
  v_club             RECORD;
  v_club_name        text;
  v_club_slug        text;
  v_reservation_id   uuid;
  v_participant_row  RECORD;
  v_updated_count    int;
  v_court_name       text;
  v_date_label       text;
  v_creator_role     text;
  v_destination      text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- OWNER is the one real blocker (see header comment): every club has
  -- exactly one active OWNER by construction, and no ownership-transfer/
  -- demotion mechanism exists to hand that off first. An ADMIN membership
  -- has no such constraint — removeAdmin already deactivates one
  -- unilaterally today with no ownership implications — so ADMIN is
  -- handled below instead of blocked here.
  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE profile_id = auth.uid() AND is_active = true AND role = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'No puedes eliminar tu cuenta mientras seas propietario activo de un club. Contáctanos para gestionar la transferencia o cierre del club antes de eliminar tu cuenta.'
      USING ERRCODE = '42501';
  END IF;

  -- Mirrors the SUPERADMIN exclusivity rule already enforced elsewhere
  -- (enforce_club_members_account_type_consistency, 20260809000001):
  -- SUPERADMIN never holds a real club_members row and operates the
  -- platform itself — anonymizing its profile here would leave a platform
  -- admin's own panel showing "Usuario eliminado" for themselves while
  -- retaining full platform-admin capability, an unrelated and
  -- inconsistent state this feature is not designed to handle.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (account_type = 'SUPERADMIN' OR is_platform_admin = true)
  ) THEN
    RAISE EXCEPTION 'Las cuentas de plataforma no pueden eliminarse por este medio' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_player_name FROM public.profiles WHERE id = auth.uid();

  -- Per-club cleanup + deactivation, identical shape to leave_club, for
  -- every active PLAYER membership the caller holds (never OWNER, blocked
  -- above; ADMIN is handled separately below with no reservation cleanup)
  -- — looped across every club instead of a single p_club_id parameter.
  FOR v_club IN
    SELECT club_id FROM public.club_members
    WHERE profile_id = auth.uid() AND is_active = true AND role = 'PLAYER'
  LOOP
    SELECT name, slug INTO v_club_name, v_club_slug FROM public.clubs WHERE id = v_club.club_id;

    FOR v_reservation_id IN
      SELECT r.id FROM public.reservations r
      WHERE r.club_id = v_club.club_id
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
        PERFORM public._reject_pending_reservation_join_requests(
          v_reservation_id, 'La reserva fue cancelada.', auth.uid()
        );
      END IF;
    END LOOP;

    FOR v_participant_row IN
      SELECT r.id AS reservation_id, r.created_by AS creator_id, r.date, r.start_time,
             r.duration_minutes, r.court_id
      FROM public.reservations r
      JOIN public.reservation_players rp ON rp.reservation_id = r.id
      WHERE r.club_id = v_club.club_id
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

      PERFORM public._maybe_reopen_reservation(v_participant_row.reservation_id);

      SELECT name INTO v_court_name FROM public.courts WHERE id = v_participant_row.court_id;
      v_date_label := CASE
        WHEN v_participant_row.date = current_date THEN 'hoy'
        WHEN v_participant_row.date = current_date + 1 THEN 'mañana'
        ELSE to_char(v_participant_row.date, 'DD/MM')
      END;

      SELECT role INTO v_creator_role
      FROM public.club_members
      WHERE club_id = v_club.club_id AND profile_id = v_participant_row.creator_id AND is_active = true;

      v_destination := CASE
        WHEN v_creator_role IN ('OWNER', 'ADMIN')
          THEN '/' || v_club_slug || '/admin/reservations/' || v_participant_row.reservation_id
        ELSE '/' || v_club_slug || '/reservations?reservationId=' || v_participant_row.reservation_id
      END;

      INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
      VALUES (
        v_participant_row.creator_id,
        v_club.club_id,
        'reservation_participant_left',
        'Un jugador dejó tu reserva',
        COALESCE(v_player_name, 'Un jugador') || ' salió del club y ya no participará en tu reserva en ' ||
          COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
          to_char(v_participant_row.start_time, 'HH24:MI') || ' a ' ||
          to_char(v_participant_row.start_time + (v_participant_row.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
        jsonb_build_object(
          'club_id', v_club.club_id,
          'club_slug', v_club_slug,
          'reservation_id', v_participant_row.reservation_id,
          'former_participant_profile_id', auth.uid(),
          'destination', v_destination
        )
      );
    END LOOP;

    UPDATE public.club_members
    SET is_active = false
    WHERE club_id = v_club.club_id AND profile_id = auth.uid() AND is_active = true;

    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    SELECT
      cm.profile_id,
      v_club.club_id,
      'player_left_club',
      'Un jugador salió del club',
      COALESCE(v_player_name, 'Un jugador') || ' salió de ' || COALESCE(v_club_name, 'tu club') || '.',
      jsonb_build_object(
        'club_id', v_club.club_id,
        'club_slug', v_club_slug,
        'player_profile_id', auth.uid(),
        'destination', '/' || v_club_slug || '/admin/players'
      )
    FROM public.club_members cm
    WHERE cm.club_id = v_club.club_id
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.is_active = true;
  END LOOP;

  -- ADMIN memberships — same bare deactivation removeAdmin already
  -- performs (src/app/(app)/[club]/admin/team/actions.ts), never the
  -- PLAYER-only reservation/participation cleanup above: an ADMIN has no
  -- personal reservation footprint of their own to clean up (their
  -- created_by on a reservation is administrative authorship, never
  -- personal participation), and removeAdmin itself never touches
  -- reservations or sends a notification either.
  UPDATE public.club_members
  SET is_active = false
  WHERE profile_id = auth.uid() AND is_active = true AND role = 'ADMIN';

  -- Pending requests the caller made themselves — ephemeral, never
  -- business history (unlike an already-resolved request). No 'cancelled'
  -- status exists on either table (CHECK only allows pending/approved/
  -- rejected, per 20260727000002/20261031000001) and there is no ongoing
  -- reason to keep an unresolved request once the account is gone, so
  -- these are deleted outright rather than forced into an ill-fitting
  -- status value.
  DELETE FROM public.club_join_requests
  WHERE profile_id = auth.uid() AND status = 'pending';

  DELETE FROM public.reservation_join_requests
  WHERE profile_id = auth.uid() AND status = 'pending';

  -- Purely personal/ephemeral — safe to delete outright (would already
  -- CASCADE if profiles itself were deleted; explicit here since profiles
  -- is anonymized in place, never deleted).
  DELETE FROM public.push_tokens WHERE profile_id = auth.uid();
  DELETE FROM public.notifications WHERE profile_id = auth.uid();

  -- Anonymize — never delete. id stays as the FK anchor for every
  -- historical reservation/ranking/tournament/news row already pointing
  -- at it; every existing join to full_name/avatar_url renders this value
  -- from here on, with no other code change required anywhere.
  UPDATE public.profiles
  SET full_name = 'Usuario eliminado', phone = NULL, avatar_url = NULL
  WHERE id = auth.uid();
END;
$$;

-- Idempotent by construction: re-running finds no active PLAYER/ADMIN
-- memberships left to process, no pending requests left to delete, no
-- push_tokens/notifications left to delete, and re-applies the same
-- already-anonymized values to profiles — every step is a safe no-op on a
-- second call, never an error, matching the same idempotency posture as
-- expire_pending_reservations elsewhere in this codebase.

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
