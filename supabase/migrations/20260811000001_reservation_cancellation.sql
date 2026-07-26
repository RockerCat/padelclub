-- ============================================================
-- Reservation cancellation — Phase 4
-- Mi Pádel Club
-- ============================================================
-- Official rule: a PLAYER may cancel a reservation they created or
-- participate in (created_by, or a reservation_players row — the same
-- "related to this reservation" definition already used elsewhere, e.g. the
-- deactivation guard and getMatchesPlayedCount in admin/players/actions.ts),
-- while it is still pending or confirmed, only while its start time is at
-- least 2 hours away. OWNER/ADMIN may cancel any reservation of their own
-- club regardless of that window, for operational reasons. Neither role can
-- cancel a reservation that's already cancelled or rejected (terminal
-- states).
--
-- A single centralized SECURITY DEFINER RPC receives ONLY the reservation
-- id. Role, club membership, participation, and the reservation's own
-- date/time are all re-read fresh from the database and auth.uid() —
-- nothing is trusted from the caller beyond which row to act on. This is
-- structurally required, not just preferred: RLS on `reservations` only
-- allows OWNER/ADMIN to UPDATE (see 20260611000007), so a PLAYER has no
-- direct write path at all and can only ever go through this function.
-- Reused by both the new PLAYER-facing cancel action
-- (reservations/actions.ts) and the existing OWNER/ADMIN cancelReservation
-- (admin/reservations/actions.ts), which now calls this RPC instead of its
-- own direct .update() — one place this decision is made, not two.
--
-- No timezone column exists anywhere on clubs — the reservation's date +
-- start_time is treated as a UTC wall-clock instant, the same implicit
-- assumption application code already makes via offset-less local Date
-- construction (new Date(`${date}T${time}`)), just expressed in SQL here
-- since this check must run server-side and never trust a client-supplied
-- "now".
--
-- reservations.status/cancelled_at/cancelled_by already exist
-- (20260611000007) — no schema change needed for the state itself, only
-- these two new functions.
-- ============================================================

-- ─── cancel_reservation ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation   public.reservations;
  v_role          text;
  v_is_related    boolean;
  v_start_at      timestamptz;
  v_updated_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Reservation is not in a cancellable state' USING ERRCODE = '22023';
  END IF;

  -- club_role() already scopes to THIS reservation's club and already
  -- requires is_active = true — an inactive membership, or a role held
  -- only in a different club, both resolve to NULL here.
  v_role := public.club_role(v_reservation.club_id);

  IF v_role IN ('OWNER', 'ADMIN') THEN
    -- Operational cancellation — no time-window restriction.
    NULL;
  ELSIF v_role = 'PLAYER' THEN
    SELECT
      v_reservation.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.reservation_players
        WHERE reservation_id = p_reservation_id AND profile_id = auth.uid()
      )
    INTO v_is_related;

    IF NOT v_is_related THEN
      RAISE EXCEPTION 'Not authorized to cancel this reservation' USING ERRCODE = '42501';
    END IF;

    -- date + time = a naive timestamp; AT TIME ZONE 'UTC' reinterprets that
    -- wall-clock value as a real UTC instant — never dependent on the DB
    -- session's own timezone setting, matching the same offset-less
    -- convention application code already uses elsewhere.
    v_start_at := (v_reservation.date + v_reservation.start_time) AT TIME ZONE 'UTC';

    IF v_start_at - now() < interval '2 hours' THEN
      RAISE EXCEPTION 'Cannot cancel within 2 hours of the reservation start time' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to cancel this reservation' USING ERRCODE = '42501';
  END IF;

  -- Atomic compare-and-swap: re-checks status in the same statement that
  -- writes it, so a concurrent cancel/approve/reject that already resolved
  -- this reservation between the SELECT above and here is caught below,
  -- never silently double-applied. Same idiom as approvePendingReservation/
  -- rejectPendingReservation.
  UPDATE public.reservations
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  WHERE id = p_reservation_id
    AND status IN ('pending', 'confirmed');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Reservation already resolved' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_reservation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO authenticated;


-- ─── notify_reservation_cancelled ──────────────────────────────────────────
-- Best-effort, called separately by the caller right after cancel_reservation
-- succeeds — same convention as notify_reservation_request_created/
-- notify_reservation_rejected (never fused into the state-changing RPC
-- itself). Direction depends on WHO cancelled, re-read from the
-- now-persisted cancelled_by column (never trusted from the caller):
--   OWNER/ADMIN cancelled → notify every affected player (creator +
--   reservation_players, deduped, excluding the canceller themselves if
--   they also happen to be one of those).
--   PLAYER cancelled → notify every active OWNER/ADMIN of the club, same
--   fan-out already used by notify_reservation_request_created.
-- A reservation with no other players and self-cancelled by its own
-- creator notifies nobody — never invents a recipient. Idempotent per
-- (type, reservation_id), same guard already used by
-- notify_reservation_request_created/notify_reservation_rejected, so a
-- retried client call can't double-notify.
CREATE OR REPLACE FUNCTION public.notify_reservation_cancelled(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_reservation    public.reservations;
  v_club_slug      text;
  v_canceller_role text;
  v_canceller_name text;
  v_court_name     text;
  v_date_label     text;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND OR v_reservation.status <> 'cancelled' OR v_reservation.cancelled_by IS NULL THEN
    RETURN; -- defensive no-op — never notifies for anything but a genuinely cancelled reservation
  END IF;

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_reservation.club_id;
  SELECT name INTO v_court_name FROM public.courts WHERE id = v_reservation.court_id;

  v_date_label := CASE
    WHEN v_reservation.date = current_date THEN 'hoy'
    WHEN v_reservation.date = current_date + 1 THEN 'mañana'
    ELSE to_char(v_reservation.date, 'DD/MM')
  END;

  SELECT role INTO v_canceller_role
  FROM public.club_members
  WHERE club_id = v_reservation.club_id AND profile_id = v_reservation.cancelled_by AND is_active = true;

  IF v_canceller_role IN ('OWNER', 'ADMIN') THEN
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'reservation_cancelled_by_admin'
        AND (metadata->>'reservation_id')::uuid = p_reservation_id
    ) THEN
      RETURN;
    END IF;

    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    SELECT DISTINCT
      affected.profile_id,
      v_reservation.club_id,
      'reservation_cancelled_by_admin',
      'Reserva cancelada',
      'Tu reserva en ' || COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI') ||
        ' fue cancelada por el club.',
      jsonb_build_object(
        'club_id', v_reservation.club_id,
        'club_slug', v_club_slug,
        'reservation_id', p_reservation_id,
        'destination', '/' || v_club_slug || '/reservations'
      )
    FROM (
      SELECT v_reservation.created_by AS profile_id
      UNION
      SELECT profile_id FROM public.reservation_players WHERE reservation_id = p_reservation_id
    ) affected
    WHERE affected.profile_id <> v_reservation.cancelled_by;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'reservation_cancelled_by_player'
        AND (metadata->>'reservation_id')::uuid = p_reservation_id
    ) THEN
      RETURN;
    END IF;

    SELECT full_name INTO v_canceller_name FROM public.profiles WHERE id = v_reservation.cancelled_by;

    INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
    SELECT
      cm.profile_id,
      v_reservation.club_id,
      'reservation_cancelled_by_player',
      'Reserva cancelada',
      COALESCE(v_canceller_name, 'Un jugador') || ' canceló su reserva en ' ||
        COALESCE(v_court_name, 'la cancha') || ' para ' || v_date_label || ' de ' ||
        to_char(v_reservation.start_time, 'HH24:MI') || ' a ' ||
        to_char(v_reservation.start_time + (v_reservation.duration_minutes || ' minutes')::interval, 'HH24:MI') || '.',
      jsonb_build_object(
        'club_id', v_reservation.club_id,
        'club_slug', v_club_slug,
        'reservation_id', p_reservation_id,
        'destination', '/' || v_club_slug || '/admin/reservations'
      )
    FROM public.club_members cm
    WHERE cm.club_id = v_reservation.club_id
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.is_active = true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reservation_cancelled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_reservation_cancelled(uuid) TO authenticated;
