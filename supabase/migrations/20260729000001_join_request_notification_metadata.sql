-- ============================================================
-- create_join_request — richer notification metadata
-- Mi Pádel Club
-- ============================================================
-- Audit confirmed the notification IS already created correctly (one row
-- per active OWNER/ADMIN, never for the requester, no duplicates thanks to
-- the early RETURN on an existing pending row) — that part was not the
-- bug. This migration only enriches its `metadata` so the bell can link
-- straight to the request without relying solely on the clubs(slug,name)
-- join. Same signature, same validation/creation logic for
-- club_join_requests — CREATE OR REPLACE, safe to reapply.
-- ============================================================

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
