-- ============================================================
-- Shared resolution state for join-request / reservation-request
-- notifications
-- Mi Pádel Club
-- ============================================================
-- A join request or reservation request notifies every active OWNER/ADMIN
-- of the club — one notification row per recipient, all correlated by the
-- same join_request_id/reservation_id in metadata. When any one of them
-- approves or rejects it, only the resolving admin's own local UI state
-- ever reflected that (JoinRequestNotificationActions' `resolved` useState
-- — never persisted, never shared). Every other recipient's notification
-- kept looking pending until they tried to act on it themselves and hit
-- the "already resolved" error.
--
-- This adds two columns to `notifications` that are explicitly NOT the
-- per-user read state (`read_at` stays untouched, still individual):
--   resolved_status — 'approved' | 'rejected', shared by every
--                      notification pointing at the same request
--   resolved_at      — when that shared resolution happened
--
-- The source of truth for the actual outcome remains the real entity
-- (club_join_requests.status / reservations.status) — these two columns
-- are a denormalized, UI-facing mirror of that outcome, written in the
-- SAME atomic operation that resolves the entity (join requests) or
-- immediately after it (reservations, via a dedicated RPC — see below),
-- never a second, independent decision.
-- ============================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS resolved_status text
    CHECK (resolved_status IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- ─── Join requests — extend the existing atomic RPCs ─────────────────────────
-- Same signature, same validation, same club_members insert / notifies-the-
-- requester side effects as before (20260729000001) — CREATE OR REPLACE,
-- safe to reapply. The only addition is the final UPDATE, resolving every
-- join_request_created notification for this request_id in one statement,
-- inside the same transaction as the entity update — so if the entity
-- update commits, the notification sync commits with it.

CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_request    public.club_join_requests;
  v_club_name  text;
  v_club_slug  text;
BEGIN
  SELECT * INTO v_request FROM public.club_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.club_role(v_request.club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_request.club_id, v_request.profile_id, 'PLAYER', true)
  ON CONFLICT (club_id, profile_id) DO NOTHING;

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

  -- Shared resolution: every OWNER/ADMIN's own join_request_created
  -- notification for this request — not just the resolver's — flips to
  -- 'approved' in the same transaction. Each recipient's existing Realtime
  -- subscription (filtered on their own profile_id) already covers this:
  -- their own row is one of the rows being updated here.
  UPDATE public.notifications
  SET resolved_status = 'approved', resolved_at = now()
  WHERE type = 'join_request_created'
    AND (metadata->>'join_request_id')::uuid = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;


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

  IF public.club_role(v_request.club_id) NOT IN ('OWNER', 'ADMIN') THEN
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

REVOKE ALL ON FUNCTION public.reject_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_join_request(uuid) TO authenticated;


-- ─── Reservation requests — new RPC, existing TS logic untouched ─────────────
-- approvePendingReservation/rejectPendingReservation (admin/reservations/
-- actions.ts) stay exactly as they are — plain authenticated Supabase
-- calls, not RPCs, so they can't UPDATE another recipient's notification
-- row directly (notifications_update_own scopes UPDATE to profile_id =
-- auth.uid()). This function is called from those actions right after the
-- reservation's own status update succeeds — same best-effort,
-- log-on-failure convention already used for
-- notify_reservation_request_created in requestReservation: the
-- reservation's real status is the source of truth and is never rolled
-- back over a notification-sync failure.
--
-- 'approved' maps to reservations.status = 'confirmed'; 'rejected' maps to
-- reservations.status = 'cancelled' (reservations has no literal
-- 'rejected'/'approved' status value) — this p_status is purely the
-- notification-facing vocabulary, kept consistent with join requests'.
CREATE OR REPLACE FUNCTION public.resolve_reservation_request_notifications(
  p_reservation_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id uuid;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT club_id INTO v_club_id FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN; -- nothing to resolve
  END IF;

  IF public.club_role(v_club_id) NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET resolved_status = p_status, resolved_at = now()
  WHERE type = 'reservation_request_created'
    AND (metadata->>'reservation_id')::uuid = p_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_reservation_request_notifications(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_reservation_request_notifications(uuid, text) TO authenticated;
