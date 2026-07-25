-- ============================================================
-- join_public_club — notify OWNER/ADMIN when a player joins directly
-- Mi Pádel Club
-- ============================================================
-- Public-club instant join (20260611000005_club_visibility.sql) never told
-- OWNER/ADMIN it happened. This adds a purely informational notification —
-- one row per active OWNER/ADMIN, same fan-out/shape as
-- create_join_request's own notification (20260729000001), reusing the
-- existing notifications table/Realtime/read-tracking — never the joining
-- player themselves, never a club_join_requests row, no approve/reject
-- state (this is a fait accompli, not a request).
--
-- Placed AFTER the club_members INSERT and never reached from the
-- `IF v_already_member THEN RETURN` early-exit above it, so this only ever
-- fires exactly once, for the operation that actually creates the new
-- membership row — a retry/double-click/reload that lands on the
-- already-member branch produces no notification, by construction (no
-- separate check needed here).
--
-- Same signature/return type, same visibility/idempotency validation as
-- before — CREATE OR REPLACE, safe to reapply, does not change the join
-- behavior itself.
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_public_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_visibility      text;
  v_already_member  boolean;
  v_club_name       text;
  v_club_slug       text;
  v_player_name     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT visibility INTO v_visibility
  FROM public.clubs
  WHERE id = p_club_id AND is_active = true;

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

  -- Idempotent: already a member is a no-op — never reaches the
  -- membership INSERT or the notification fan-out below.
  IF v_already_member THEN
    RETURN;
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (p_club_id, auth.uid(), 'PLAYER', true);

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
