-- ============================================================
-- approve_join_request — richer notification metadata
-- Mi Pádel Club
-- ============================================================
-- The requester's "Solicitud aprobada" notification carried no metadata at
-- all (just profile_id/club_id/type/title/message), so hrefForNotification
-- fell back to a generic "/clubs" for every join_request_approved
-- notification instead of sending the player straight to the club they were
-- just approved into. This mirrors the same fix already applied to
-- create_join_request (see 20260729000001): store club_slug + a concrete
-- destination in metadata at creation time, so the click doesn't depend on
-- a separate lookup. Same signature/validation/side effects otherwise —
-- CREATE OR REPLACE, safe to reapply. reject_join_request is untouched:
-- rejected requests still resolve to /clubs, unchanged by this migration.
-- ============================================================

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
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;
