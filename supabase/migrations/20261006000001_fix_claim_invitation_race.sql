-- ============================================================
-- Fix race condition in claim_invitation (single-use link reuse)
-- Mi Pádel Club
-- ============================================================
-- Found during a full functional audit of Entrega de Club: unlike
-- claim_club/platform_generate_club_claim_link (both already lock their
-- token row with FOR UPDATE — see 20261003000001/20261005000001),
-- claim_invitation has never locked invitation_links while checking
-- max_uses/uses. insertSingleUseInvite (src/lib/invitations.ts) always
-- creates ADMIN invites with max_uses = 1 — the whole point being that
-- exactly one person may ever activate that link.
--
-- Under READ COMMITTED (Postgres' default, unchanged here), two
-- concurrent claim_invitation calls for the SAME token — two browser tabs,
-- a double submit, or two different people who both got hold of the same
-- link — could both read uses < max_uses before either commits its own
-- `UPDATE invitation_links SET uses = uses + 1`. Since they're different
-- auth.uid() callers, both INSERTs into club_members succeed
-- (club_members' own UNIQUE(club_id, profile_id) never collides across
-- two different profiles) — letting a link meant for exactly one ADMIN be
-- claimed by two different people. This is a genuine, real bypass of the
-- "single-use" invariant, not a hypothetical.
--
-- Fix: identical pattern already proven elsewhere in this exact codebase —
-- FOR UPDATE on the token row serializes concurrent callers. The loser
-- blocks until the winner commits, then re-reads the now-current uses
-- count and correctly hits max_uses_reached. Every other line of this
-- function is byte-identical to 20260809000001.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link          invitation_links%ROWTYPE;
  v_club_slug     text;
  v_existing      int;
  v_account_type  text;
  v_has_history   boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_link
  FROM   invitation_links
  WHERE  token     = p_token
    AND  is_active = true
    AND  expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF v_link.max_uses IS NOT NULL AND v_link.uses >= v_link.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'max_uses_reached');
  END IF;

  SELECT slug INTO v_club_slug FROM clubs WHERE id = v_link.club_id;

  SELECT count(*) INTO v_existing
  FROM   club_members
  WHERE  club_id    = v_link.club_id
    AND  profile_id = auth.uid();

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug, 'already_member', true);
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();

  IF v_link.role = 'ADMIN' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_members WHERE profile_id = auth.uid()
    ) INTO v_has_history;

    IF v_account_type IS NOT NULL OR v_has_history THEN
      RETURN jsonb_build_object('success', false, 'error', 'admin_requires_no_history');
    END IF;
  ELSE
    IF v_account_type IN ('OWNER', 'ADMIN') THEN
      RETURN jsonb_build_object('success', false, 'error', 'account_type_conflict');
    END IF;
  END IF;

  INSERT INTO club_members (club_id, profile_id, role, is_active)
  VALUES (v_link.club_id, auth.uid(), v_link.role, true);

  UPDATE public.profiles SET account_type = v_link.role WHERE id = auth.uid() AND account_type IS NULL;

  UPDATE invitation_links
  SET    uses = uses + 1
  WHERE  id   = v_link.id;

  RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug, 'already_member', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_invitation(text) TO authenticated;
