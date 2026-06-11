-- ============================================================
-- Migration 006 — Add club branding to get_invitation_preview
-- PadelClub
-- ============================================================
-- Adds primary_color and secondary_color to the invite preview
-- so that invite and signup screens can render club branding
-- without requiring the visitor to be authenticated.
-- ============================================================

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
    'club_logo_url',    v_club.logo_url,
    'primary_color',    v_club.primary_color,
    'secondary_color',  v_club.secondary_color
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_preview(text) TO anon, authenticated;
