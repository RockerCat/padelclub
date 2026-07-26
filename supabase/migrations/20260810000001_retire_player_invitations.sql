-- ============================================================
-- Retire PLAYER token invitations — Phase 2
-- Mi Pádel Club
-- ============================================================
-- Official rule (CLAUDE.md → Club Sharing Principles): there are no
-- invitations for players. A PLAYER only ever links to a club through
-- join_public_club (instant, public), or create_join_request +
-- approve_join_request (private, request+approval). The only remaining
-- real, tracked, token-based invitation is ADMIN — that flow (creation,
-- claim, expiry/revocation/single-use, get_invitation_preview) is
-- untouched by this migration.
--
-- invitation_links/claim_invitation/get_invitation_preview are shared
-- infrastructure between the two roles (see the Phase 2 audit) — nothing
-- here drops the table or the functions, only narrows what a PLAYER-role
-- row can do going forward:
--   1. No new invitation_links row may ever be INSERTed with role='PLAYER'
--      again (BEFORE INSERT trigger — historical rows are untouched and
--      stay fully updatable, since a CHECK constraint — even NOT VALID —
--      would apply to every future UPDATE of those rows too, including the
--      is_active flip in step 4 below, not just new INSERTs).
--   2. claim_invitation rejects any non-ADMIN link outright, before it
--      could ever create a club_members row.
--   3. get_invitation_preview reports a PLAYER-role link as invalid, so
--      /invite/[token]'s existing "Invitación inválida" state (already
--      built, no route changes needed) is what a historical PLAYER token
--      shows — never a silent auto-join, never an inviting preview that
--      then fails to claim.
-- ============================================================

-- ─── 1. Block future PLAYER rows via INSERT-only trigger ───────────────────
-- A CHECK constraint (even added NOT VALID) is enforced on every subsequent
-- UPDATE of a row, not just new INSERTs — since NOT VALID only skips the
-- one-time validation of rows that already existed when the constraint was
-- added, it does not exempt them from later writes. That would make step 4
-- below (flipping is_active on the 2 historical PLAYER rows) fail, because
-- a CHECK (role = 'ADMIN') would reject the resulting row for still being
-- role='PLAYER' even though role itself isn't what's being changed. A
-- BEFORE INSERT trigger has no such problem: it only ever fires for a brand
-- new row, so historical PLAYER rows remain fully updatable (is_active,
-- uses, or any other column) forever, while no new role='PLAYER' row can
-- ever be created again. The table's own original CHECK (role IN ('ADMIN',
-- 'PLAYER'), 20260610000001) is untouched.
--
-- Defensive cleanup: an earlier attempt at this migration added the CHECK
-- constraint described above before failing on step 4's UPDATE — drop it
-- if present, so this file is safe to (re)run regardless of which attempt
-- a given database has actually seen.
ALTER TABLE public.invitation_links
  DROP CONSTRAINT IF EXISTS invitation_links_role_admin_only;

DROP TRIGGER IF EXISTS invitation_links_admin_only_insert ON public.invitation_links;
DROP FUNCTION IF EXISTS public.enforce_invitation_links_admin_only_insert();

CREATE FUNCTION public.enforce_invitation_links_admin_only_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF NEW.role != 'ADMIN' THEN
    RAISE EXCEPTION 'invitation_links can only be created with role = ADMIN — player invitations are retired'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invitation_links_admin_only_insert
  BEFORE INSERT ON public.invitation_links
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invitation_links_admin_only_insert();

-- ─── 2. claim_invitation — reject any non-ADMIN link outright ─────────────
-- Same token/expiry/max-uses validation and the same already-a-member
-- short-circuit as before (20260809000001) — CREATE OR REPLACE, safe to
-- reapply. The only change: a link that isn't role='ADMIN' is rejected
-- immediately after the already-member check (so an existing member
-- re-clicking an old link — of either role — still gets the harmless
-- "already_member: true" outcome, unchanged), and never reaches the
-- account_type validation or the club_members INSERT that used to live in
-- its own ELSE branch for PLAYER.
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
    AND  expires_at > now();

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

  -- Not yet a member — this token would have to create a NEW membership.
  -- Player invitations are retired: the only real invitation left is ADMIN.
  IF v_link.role != 'ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'error', 'player_invites_retired');
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();

  SELECT EXISTS (
    SELECT 1 FROM public.club_members WHERE profile_id = auth.uid()
  ) INTO v_has_history;

  IF v_account_type IS NOT NULL OR v_has_history THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_requires_no_history');
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

-- ─── 3. get_invitation_preview — a PLAYER-role link previews as invalid ────
-- Same shape/fields as before (20260611000006) — CREATE OR REPLACE, safe to
-- reapply. Only the `valid` computation changes: it now also requires
-- role = 'ADMIN'. A historical PLAYER link that's otherwise active/
-- unexpired/not-maxed-out now reports valid:false with every specific
-- reason flag (is_active/expired/max_uses_reached) still true-to-reality —
-- /invite/[token]'s existing fallback ("Link de invitación inválido.")
-- already renders correctly for exactly this combination, with no route
-- changes needed.
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
    'valid',            v_link.role = 'ADMIN'
                          AND v_link.is_active
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

-- ─── 4. Historical PLAYER links: mark inactive, never delete ───────────────
-- Functionally these are already fully inert regardless of is_active — both
-- get_invitation_preview and claim_invitation above reject any non-ADMIN
-- role unconditionally, so a still-"active" PLAYER row can no longer be
-- previewed as valid or claimed either way. This UPDATE only makes the raw
-- data itself honestly reflect that ("revoked", not "still open") — no row
-- is deleted, every other column (role, uses, created_by, created_at, etc.)
-- is untouched, full history preserved. As of writing this migration, real
-- data showed exactly 2 such rows (club 2a3a969a-a02c-4378-a693-05568ce4f2e0,
-- one with uses=0, one with uses=2) — reported here rather than silently
-- changed; re-run is idempotent (WHERE is_active = true only touches rows
-- not already flipped).
UPDATE public.invitation_links
SET is_active = false
WHERE role = 'PLAYER' AND is_active = true;
