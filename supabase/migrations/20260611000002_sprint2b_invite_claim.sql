-- ============================================================
-- Sprint 2B — Invite Claim Functions
-- PadelClub
-- ============================================================
-- Purpose:
--   Two SECURITY DEFINER functions to support the invite flow
--   without exposing invitation_links via broad RLS policies.
--
--   1. get_invitation_preview(token) — anon-accessible preview
--      Returns club name, role, expiry status.  No auth needed.
--
--   2. claim_invitation(token) — authenticated claim
--      Validates token, inserts club_member, increments uses.
-- ============================================================


-- ─── 1. get_invitation_preview ───────────────────────────────────────────────
-- Returns basic info about an invitation so the /invite/[token] page
-- can render without requiring the visitor to be a club member.
-- STABLE: read-only, result can be cached per statement.

CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link  invitation_links%ROWTYPE;
  v_club  clubs%ROWTYPE;
BEGIN
  SELECT * INTO v_link
  FROM   invitation_links
  WHERE  token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_club FROM clubs WHERE id = v_link.club_id;

  RETURN jsonb_build_object(
    'valid',            v_link.is_active
                          AND v_link.expires_at > now()
                          AND (v_link.max_uses IS NULL OR v_link.uses < v_link.max_uses),
    'is_active',        v_link.is_active,
    'expired',          v_link.expires_at <= now(),
    'max_uses_reached', v_link.max_uses IS NOT NULL AND v_link.uses >= v_link.max_uses,
    'role',             v_link.role,
    'expires_at',       v_link.expires_at,
    'club_name',        v_club.name,
    'club_slug',        v_club.slug,
    'club_logo_url',    v_club.logo_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_preview(text) TO anon, authenticated;


-- ─── 2. claim_invitation ─────────────────────────────────────────────────────
-- Authenticated users call this to join a club via an invitation token.
-- Handles duplicate prevention and uses counter atomically.

CREATE OR REPLACE FUNCTION public.claim_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link      invitation_links%ROWTYPE;
  v_club_slug text;
  v_existing  int;
BEGIN
  -- Require an authenticated caller
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Validate the token
  SELECT * INTO v_link
  FROM   invitation_links
  WHERE  token     = p_token
    AND  is_active = true
    AND  expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF v_link.max_uses IS NOT NULL AND v_link.uses >= v_link.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'max_uses_reached');
  END IF;

  -- Get club slug for redirect
  SELECT slug INTO v_club_slug FROM clubs WHERE id = v_link.club_id;

  -- Prevent duplicates
  SELECT count(*) INTO v_existing
  FROM   club_members
  WHERE  club_id    = v_link.club_id
    AND  profile_id = auth.uid();

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug, 'already_member', true);
  END IF;

  -- Insert membership
  INSERT INTO club_members (club_id, profile_id, role, is_active)
  VALUES (v_link.club_id, auth.uid(), v_link.role, true);

  -- Increment uses counter
  UPDATE invitation_links
  SET    uses = uses + 1
  WHERE  id   = v_link.id;

  RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug, 'already_member', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_invitation(text) TO authenticated;
