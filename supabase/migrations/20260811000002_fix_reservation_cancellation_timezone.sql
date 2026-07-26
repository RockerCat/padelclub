-- ============================================================
-- Fix reservation cancellation timezone — Phase 4 correction
-- Mi Pádel Club
-- ============================================================
-- 20260811000001 (already applied) computed the reservation's start
-- instant as `(date + start_time) AT TIME ZONE 'UTC'`, on the assumption
-- that reservations.date/start_time were UTC wall-clock values. Audit of
-- the rest of the codebase shows that assumption is wrong:
--
--   - reservations.date is `date`, reservations.start_time is `time`
--     (20260611000007) — neither carries any offset; there is no
--     starts_at/timestamptz column and no clubs.timezone column anywhere.
--   - Every write path (requestReservation, createReservation) and every
--     read/comparison path (the "already passed" check in
--     reservations/actions.ts, isReservationActive/isReservationInProgress
--     in PlayerActivity.tsx, court-availability/conflict checks in
--     courtDayAvailability.ts) builds these values from/against a plain
--     `new Date(...)` using LOCAL calendar/clock components
--     (getFullYear/getMonth/getDate/getHours/getMinutes) — never UTC ones.
--   - PROJECT_STATUS.md documents this explicitly as a fixed bug: "un bug
--     de mezcla UTC/local (toISOString() vs getHours()/getMinutes())
--     rechazaba incorrectamente reservas futuras... cerca de la medianoche
--     en horario local" — the resolution was to standardize on LOCAL time
--     everywhere, specifically rejecting toISOString()/UTC for this exact
--     kind of check.
--   - Every currency amount in the product is formatted "es-CO" (Colombian
--     pesos) and every date "es-MX"; there is no per-club timezone control
--     and no evidence of any other target market — "local" here means
--     Colombia's one operative timezone, not the deploying server's own
--     process TZ (which is environment-dependent and, on typical
--     serverless Node runtimes, defaults to UTC regardless of where the
--     business actually operates — the opposite of what "local" was meant
--     to mean in the PROJECT_STATUS.md fix above).
--
-- Net effect of the bug: on any deployment where the Postgres session (or,
-- previously, the Node process) doesn't happen to already be UTC-5, every
-- PLAYER cancellation was time-gated against the wrong instant, shifted by
-- Colombia's fixed UTC-5 offset — see the migration's own report for a
-- worked example of a reservation that should be cancellable (5.5h out)
-- being incorrectly rejected as "less than 2 hours away".
--
-- Fix: reinterpret date + start_time as America/Bogota wall-clock time
-- (Colombia has no DST, so this is equivalent to a fixed -05:00 offset,
-- but expressed as the real IANA zone rather than a hardcoded offset, per
-- the project's own convention). This migration touches ONLY
-- cancel_reservation's time-window calculation — signature, permissions,
-- SECURITY DEFINER, search_path, every validation, every error code, the
-- atomic compare-and-swap, and OWNER/ADMIN's unrestricted cancellation are
-- all unchanged. notify_reservation_cancelled and every other object from
-- 20260811000001 are untouched.
-- ============================================================

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

    -- date + time = a naive timestamp with no offset of its own. The
    -- product's one operative timezone is Colombia (es-CO currency
    -- formatting throughout, no clubs.timezone column, no other market in
    -- evidence) — AT TIME ZONE 'America/Bogota' reinterprets that
    -- wall-clock value as the real instant it represents there (Colombia
    -- has no DST, so this is a stable, always-correct -05:00), then the
    -- comparison against now() (an absolute instant) is correct regardless
    -- of whatever timezone the Postgres session or the calling process
    -- itself happens to be running in.
    v_start_at := (v_reservation.date + v_reservation.start_time) AT TIME ZONE 'America/Bogota';

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
