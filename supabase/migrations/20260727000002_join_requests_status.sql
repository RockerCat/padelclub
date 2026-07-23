-- ============================================================
-- Club Join Requests — status tracking + atomic RPCs
-- Mi Pádel Club
-- ============================================================
-- club_join_requests previously had no status column: every row was
-- implicitly "pending", approving deleted it after inserting the
-- membership, and rejecting just deleted it. That meant no history, no
-- way to tell a player they were rejected (the row was already gone),
-- and no hook to fire a notification from. This migration adds status
-- tracking and moves creation/approval/rejection into SECURITY DEFINER
-- RPCs so each is one atomic transaction that also writes the matching
-- notification — instead of the app doing insert-then-delete-then
-- (nothing) across separate round trips.
--
-- No re-request after a rejection: UNIQUE(club_id, profile_id) already
-- constrains a profile to a single row per club, and rows are no longer
-- deleted — so a rejected request permanently blocks a new one unless
-- that row is removed. There was no pre-existing rule for this case;
-- rather than invent a cooldown/override, create_join_request below
-- keeps the single-request behavior and returns a clear error instead.
-- ============================================================

ALTER TABLE public.club_join_requests
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS club_join_requests_status_idx
  ON public.club_join_requests (club_id, status);

-- club_join_requests_delete_admin is no longer used by the app (approve/
-- reject now update status instead of deleting) — dropped so the only way
-- to resolve a request is through the RPCs below, which also write the
-- notification. SELECT/INSERT policies are untouched.
DROP POLICY IF EXISTS "club_join_requests_delete_admin" ON public.club_join_requests;


-- ─── create_join_request ────────────────────────────────────────────────────
-- Self-service: any authenticated non-member can call this for any club.
-- Idempotent for an already-pending request, blocks re-requesting after a
-- rejection, and blocks if already a member. Notifies every OWNER/ADMIN of
-- the club — those inserts need SECURITY DEFINER since the caller isn't
-- one of them.
CREATE OR REPLACE FUNCTION public.create_join_request(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_existing        public.club_join_requests;
  v_club_name       text;
  v_requester_name  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

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
  VALUES (p_club_id, auth.uid(), 'pending');

  SELECT name INTO v_club_name FROM public.clubs WHERE id = p_club_id;
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (profile_id, club_id, type, title, message, metadata)
  SELECT
    cm.profile_id,
    p_club_id,
    'join_request_created',
    'Nueva solicitud de ingreso',
    COALESCE(v_requester_name, 'Un usuario') || ' quiere unirse a ' || COALESCE(v_club_name, 'tu club') || '.',
    jsonb_build_object('requester_profile_id', auth.uid())
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.role IN ('OWNER', 'ADMIN')
    AND cm.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_join_request(uuid) TO authenticated;


-- ─── approve_join_request ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
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

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_request.club_id, v_request.profile_id, 'PLAYER', true)
  ON CONFLICT (club_id, profile_id) DO NOTHING;

  UPDATE public.club_join_requests
  SET status = 'approved', approved_at = now(), approved_by = auth.uid()
  WHERE id = p_request_id;

  SELECT name INTO v_club_name FROM public.clubs WHERE id = v_request.club_id;

  INSERT INTO public.notifications (profile_id, club_id, type, title, message)
  VALUES (
    v_request.profile_id,
    v_request.club_id,
    'join_request_approved',
    'Solicitud aprobada',
    'Tu solicitud para unirte a ' || COALESCE(v_club_name, 'el club') || ' fue aprobada.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;


-- ─── reject_join_request ─────────────────────────────────────────────────────
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
END;
$$;

REVOKE ALL ON FUNCTION public.reject_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_join_request(uuid) TO authenticated;


-- ─── get_club_join_requests ──────────────────────────────────────────────────
-- Admin list view: name + email (email needs auth.users, not reachable via
-- normal RLS-scoped queries) for a specific club, gated on the caller's
-- role in THAT club — same isolation guarantee as club_role() everywhere
-- else, not a platform-wide read.
CREATE OR REPLACE FUNCTION public.get_club_join_requests(p_club_id uuid)
RETURNS TABLE (
  id          uuid,
  profile_id  uuid,
  full_name   text,
  email       text,
  status      text,
  created_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    r.id,
    r.profile_id,
    p.full_name,
    u.email,
    r.status,
    r.created_at
  FROM public.club_join_requests r
  JOIN public.profiles p ON p.id = r.profile_id
  LEFT JOIN auth.users u ON u.id = r.profile_id
  WHERE r.club_id = p_club_id
    AND public.club_role(p_club_id) IN ('OWNER', 'ADMIN')
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_club_join_requests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_join_requests(uuid) TO authenticated;
