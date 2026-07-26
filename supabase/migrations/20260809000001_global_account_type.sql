-- ============================================================
-- Global account model — Phase 1
-- Mi Pádel Club
-- ============================================================
-- Official rule: SUPERADMIN/OWNER/ADMIN/PLAYER are global, permanent
-- account types, independent of any specific club membership. An OWNER can
-- own several clubs but is never also a PLAYER or ADMIN anywhere. An ADMIN
-- exists only via an OWNER's invitation, administers exactly one club, and
-- never changes role — except the one narrow, permanent exception: a
-- PLAYER-invite-shaped profile that has NEVER belonged to any club (no
-- active membership, no inactive/historical membership, ever) may accept
-- an ADMIN invitation and become ADMIN. SUPERADMIN is a fifth, fully
-- exclusive type: it can never be OWNER/ADMIN/PLAYER, never holds any
-- club_members row (active or inactive), and never participates
-- operationally inside a club — it only ever operates the platform itself.
--
-- club_members.role is still per-row (per club), but this migration adds
-- the missing GLOBAL source of truth — profiles.account_type — and
-- enforces, at every place a club_members row can be created, that the
-- caller's global type is compatible with the role about to be granted.
-- Per explicit product direction: the check is based on this persistent
-- column (which itself is backfilled from — and going forward stays in
-- sync with — full club_members history, active or inactive), not derived
-- fresh from club_members on every call.
-- ============================================================

-- ─── 0. Pre-flight — abort if any SUPERADMIN already has club history ──────
-- profiles.is_platform_admin already exists (20260722000001) and is
-- unrelated to this migration's new column, so this check can run before
-- anything else changes. Per explicit instruction: never invent a fix or
-- delete data for a real conflict — abort the whole migration (transactional
-- DDL — nothing below this point commits either) and require manual
-- resolution instead.
DO $$
DECLARE
  v_conflict_count int;
BEGIN
  SELECT count(DISTINCT p.id) INTO v_conflict_count
  FROM public.profiles p
  JOIN public.club_members cm ON cm.profile_id = p.id
  WHERE p.is_platform_admin = true;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION
      'Aborting migration: % SUPERADMIN profile(s) (is_platform_admin = true) have existing club_members rows (active or inactive). This must be resolved manually — this migration will not guess which side is correct.',
      v_conflict_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- ─── 1. profiles.account_type ──────────────────────────────────────────────
-- NULL = untyped: a brand-new profile that has never taken a qualifying
-- action yet (create a club, join/request one, or accept an invite). Once
-- set, it is permanent — nothing in this migration ever changes it back to
-- NULL or overwrites an already-set value (enforced by the trigger below,
-- not just by convention).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text
    CHECK (account_type IN ('SUPERADMIN', 'OWNER', 'ADMIN', 'PLAYER'));

-- profiles_update_own (20260610000001) lets any authenticated user update
-- their OWN profile row, `USING (id = auth.uid())`, with no WITH CHECK and
-- no column restriction of its own. 20260611000003 (last_club_id) even
-- documents relying on exactly that: "existing profiles_update_own policy
-- covers this column... No new RLS policy needed" — confirming `authenticated`
-- really does hold an unrestricted, table-level UPDATE privilege on
-- profiles (Supabase's own project-default grant; this codebase never
-- narrows it for profiles the way later tables like courts/club_news do).
--
-- A column-level REVOKE alone does NOT close this: PostgreSQL privilege
-- checks pass if ANY applicable grant allows the operation, and a
-- pre-existing unrestricted table-level UPDATE grant already covers every
-- column, account_type included — a column-specific REVOKE only removes a
-- separate, narrower ACL entry, it does not narrow a broader one that
-- still grants the same privilege. The only way to actually restrict which
-- columns `authenticated` may write is to REVOKE the broad table-level
-- UPDATE entirely, then GRANT UPDATE back only for the real, legitimate
-- self-service fields. account_type (and is_platform_admin, a pre-existing,
-- separately-owned column this migration does not otherwise touch) are
-- deliberately left out of this list — SECURITY DEFINER functions and
-- triggers below are unaffected either way, since they execute as their
-- owner/table-owner, never as `authenticated`.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, phone, last_club_id) ON public.profiles TO authenticated;

-- ─── 2. account_type is permanent once set ─────────────────────────────────
-- Structural backstop, independent of any RLS policy or grant: once a
-- profile's account_type is non-null, no UPDATE — however it reaches the
-- table, including from a SECURITY DEFINER function — may change it to a
-- different value or back to NULL. The only allowed transition is
-- NULL → one of OWNER/ADMIN/PLAYER (the WHEN clause only fires the check
-- when account_type actually changes, so unrelated profile updates, e.g. to
-- full_name, never pay this cost).
CREATE OR REPLACE FUNCTION public.enforce_account_type_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF OLD.account_type IS NOT NULL THEN
    RAISE EXCEPTION 'account_type is permanent once set and cannot change (was %, attempted %)',
      OLD.account_type, NEW.account_type
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_account_type_immutable ON public.profiles;
CREATE TRIGGER profiles_account_type_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.account_type IS DISTINCT FROM NEW.account_type)
  EXECUTE FUNCTION public.enforce_account_type_immutable();

-- ─── 3. Backfill SUPERADMIN from is_platform_admin (takes precedence) ──────
-- Runs BEFORE the club_members-based backfill below, which only ever
-- touches rows still `account_type IS NULL` — so a profile typed SUPERADMIN
-- here is never re-typed by that later step, giving it precedence for free
-- through ordering alone, exactly as instructed. The pre-flight check above
-- already guarantees no is_platform_admin profile has any club_members row.
UPDATE public.profiles
SET account_type = 'SUPERADMIN'
WHERE is_platform_admin = true
  AND account_type IS NULL;

-- ─── 4. Backfill from existing club_members history ────────────────────────
-- Considers every row (active or inactive) per the same "once, always"
-- philosophy as the ADMIN exception. Precedence OWNER > ADMIN > PLAYER for
-- any profile whose historical rows mix roles (a pre-existing data state
-- this migration cannot itself resolve — see the audit report for the
-- affected profiles, if any). Never touches a profile already typed
-- SUPERADMIN in the previous step (WHERE account_type IS NULL).
UPDATE public.profiles p
SET account_type = sub.derived_type
FROM (
  SELECT
    cm.profile_id,
    CASE
      WHEN bool_or(cm.role = 'OWNER')  THEN 'OWNER'
      WHEN bool_or(cm.role = 'ADMIN')  THEN 'ADMIN'
      WHEN bool_or(cm.role = 'PLAYER') THEN 'PLAYER'
    END AS derived_type
  FROM public.club_members cm
  GROUP BY cm.profile_id
) sub
WHERE p.id = sub.profile_id
  AND p.account_type IS NULL;

-- ─── 5. club_members ↔ account_type consistency (the central backstop) ────
-- club_members_insert (20260610000001) only requires the caller to be
-- OWNER/ADMIN of the target club — `WITH CHECK (club_role(club_id) IN
-- ('OWNER','ADMIN'))` — with no restriction on which profile_id/role the
-- inserted row may carry. club_members_update similarly has no WITH CHECK
-- at all, so any OWNER/ADMIN can UPDATE any column of any row in their
-- club, role included. Neither policy, nor any RPC, is what ultimately
-- keeps club_members.role consistent with the profile's global
-- account_type — this trigger is, and it applies to every INSERT/UPDATE
-- regardless of caller (a current RPC, a future RPC, or a direct
-- `.from("club_members")` call from an OWNER/ADMIN's own session that the
-- RLS policies above would otherwise allow through unchecked).
--
-- Two independent checks, neither trusting the other to have run:
--   1. If the profile already has a fixed account_type, NEW.role must
--      match it exactly. An untyped profile (account_type IS NULL) may
--      take a first membership in any role — this is intentionally
--      permissive here because it is this exact insert that becomes that
--      profile's qualifying action; identifying "was this in fact a
--      controlled flow" is the RPC's job, not this trigger's (see item 3
--      of the audit report this migration was written to accompany).
--   2. Cross-checked directly against this profile's actual club_members
--      history (never solely against account_type, in case that column
--      were ever out of sync): ADMIN is single-club, full stop, including
--      its own historical rows — any other row at all (any club, any
--      role, active or inactive) blocks a new ADMIN row. OWNER/PLAYER are
--      legitimately multi-club, but every row must carry the same role as
--      every other row for that profile.
--   3. SUPERADMIN is checked both via account_type AND directly via
--      is_platform_admin (never solely one signal — same "cross-check,
--      don't trust a single column" posture as check 2) — a SUPERADMIN
--      profile is rejected unconditionally, before any of the above, since
--      it can never legitimately hold any club_members row at all.
CREATE OR REPLACE FUNCTION public.enforce_club_members_account_type_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_account_type      text;
  v_is_platform_admin boolean;
  v_conflicting_role  text;
BEGIN
  SELECT account_type, is_platform_admin INTO v_account_type, v_is_platform_admin
  FROM public.profiles WHERE id = NEW.profile_id;

  IF v_account_type = 'SUPERADMIN' OR v_is_platform_admin THEN
    RAISE EXCEPTION 'SUPERADMIN accounts cannot hold any club membership' USING ERRCODE = '23514';
  END IF;

  IF v_account_type IS NOT NULL AND v_account_type != NEW.role THEN
    RAISE EXCEPTION 'club_members.role (%) is incompatible with this profile''s account_type (%)',
      NEW.role, v_account_type
      USING ERRCODE = '23514';
  END IF;

  IF NEW.role = 'ADMIN' THEN
    IF EXISTS (
      SELECT 1 FROM public.club_members
      WHERE profile_id = NEW.profile_id AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'This profile cannot hold an ADMIN membership — ADMIN is single-club, and only ever for a profile with zero prior club history'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT role INTO v_conflicting_role
    FROM public.club_members
    WHERE profile_id = NEW.profile_id
      AND id IS DISTINCT FROM NEW.id
      AND role != NEW.role
    LIMIT 1;

    IF v_conflicting_role IS NOT NULL THEN
      RAISE EXCEPTION 'This profile already has a % membership elsewhere — cannot also hold a % membership',
        v_conflicting_role, NEW.role
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_members_account_type_consistency ON public.club_members;
CREATE TRIGGER club_members_account_type_consistency
  BEFORE INSERT OR UPDATE ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_club_members_account_type_consistency();

-- ─── 6. club_members → account_type auto-assignment (centralized) ─────────
-- Every RPC below already sets account_type explicitly right after
-- inserting a club_members row — kept as-is (harmless, idempotent
-- redundancy). This trigger makes that assignment automatic and
-- unconditional at the database level too, so a future RPC (or any other
-- insert this trigger's WITH CHECK above allowed through) can never leave
-- a profile with real club history but a still-NULL account_type — which
-- would otherwise silently escape every account_type-based check the next
-- time that profile attempts a different action.
CREATE OR REPLACE FUNCTION public.set_account_type_from_club_members()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET account_type = NEW.role
  WHERE id = NEW.profile_id AND account_type IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_members_set_account_type ON public.club_members;
CREATE TRIGGER club_members_set_account_type
  AFTER INSERT OR UPDATE ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_account_type_from_club_members();

-- ─── 7. Block direct client writes on club_members ─────────────────────────
-- The trigger above closes the *consistency* gap, but not the *bypass* gap:
-- club_members_insert (20260610000001) lets any OWNER/ADMIN of a club
-- INSERT an arbitrary row for that club with no restriction on role/
-- profile_id — enough to hand-create an ADMIN with no invitation, or a
-- PLAYER outside the public-join/private-request flow, skipping every RPC
-- validation and notification. club_members_update has no WITH CHECK at
-- all, so the same OWNER/ADMIN can UPDATE role/club_id/profile_id on any
-- existing row directly. Official decision: membership rows may only ever
-- be created, reactivated, or role-changed through a SECURITY DEFINER RPC.
--
-- REVOKE/GRANT, not a WITH CHECK rewrite of the pre-existing RLS policies
-- (left untouched — this is a new migration, not an edit of
-- 20260610000001): a column-level GRANT makes it structurally impossible
-- for `authenticated` to even reference role/club_id/profile_id in an
-- UPDATE's SET clause, regardless of what any USING/WITH CHECK clause
-- would otherwise allow — a stronger, simpler guarantee than trying to
-- express "these three columns must never change" as a policy expression.
-- SECURITY DEFINER functions execute as their owner (already proven
-- throughout this project — every RPC above already writes club_members
-- despite these same restrictive RLS policies), so REVOKE/GRANT against
-- `authenticated` specifically never affects them.
--
-- INSERT: fully revoked. create_club_with_owner, join_public_club,
-- approve_join_request and claim_invitation are the only paths left that
-- can ever create a club_members row — ADMIN only via claim_invitation
-- with a valid ADMIN invitation, PLAYER only via join_public_club,
-- create_join_request+approve_join_request, or claim_invitation with a
-- PLAYER invitation (invitation_links/the PLAYER-invite flow itself is
-- untouched here — that removal belongs to a later phase).
--
-- UPDATE: narrowed to exactly the two columns the current app legitimately
-- writes directly, confirmed by reading every call site — never role,
-- club_id, or profile_id:
--   is_active — toggleMemberActive (admin/players/actions.ts) and
--               removeAdmin (admin/team/actions.ts), both plain
--               authenticated client calls, no RPC.
--   category  — updateMemberCategory (admin/players/actions.ts), same
--               pattern, unrelated to the account model (skill level).
REVOKE INSERT, UPDATE ON public.club_members FROM authenticated;
GRANT UPDATE (is_active, category) ON public.club_members TO authenticated;


-- ─── 8. create_club_with_owner ──────────────────────────────────────────────
-- Only an OWNER-typed (or not-yet-typed) profile may create a club. Same
-- signature/visibility validation as before (20260611000005) — CREATE OR
-- REPLACE, safe to reapply.
CREATE OR REPLACE FUNCTION public.create_club_with_owner(
  p_name text,
  p_slug text,
  p_visibility text DEFAULT 'public'
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id uuid := gen_random_uuid();
  v_account_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility value' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (auth.uid())
  ON CONFLICT ON CONSTRAINT profiles_pkey DO NOTHING;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IS NOT NULL AND v_account_type != 'OWNER' THEN
    RAISE EXCEPTION 'This account cannot create a club — its account type is already %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.clubs (id, name, slug, visibility)
  VALUES (v_club_id, p_name, p_slug, p_visibility);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_club_id, auth.uid(), 'OWNER', true);

  UPDATE public.profiles SET account_type = 'OWNER' WHERE id = auth.uid() AND account_type IS NULL;

  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_with_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_with_owner(text, text, text) TO authenticated;


-- ─── 9. join_public_club ────────────────────────────────────────────────────
-- Only a PLAYER-typed (or not-yet-typed) profile may join a public club
-- instantly. Same visibility/idempotency validation and same
-- player-joined-public-club notification fan-out as before
-- (20260808000001) — CREATE OR REPLACE, safe to reapply.
CREATE OR REPLACE FUNCTION public.join_public_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_visibility      text;
  v_already_member  boolean;
  v_account_type    text;
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

  IF v_already_member THEN
    RETURN;
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This account cannot join as a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (p_club_id, auth.uid(), 'PLAYER', true);

  UPDATE public.profiles SET account_type = 'PLAYER' WHERE id = auth.uid() AND account_type IS NULL;

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


-- ─── 10. create_join_request ────────────────────────────────────────────────
-- Only a PLAYER-typed (or not-yet-typed) profile may request to join a
-- private club. Same validation/notification fan-out as before
-- (20260729000001) — CREATE OR REPLACE, safe to reapply. No account_type
-- SET here: this only creates a club_join_requests row, never a
-- club_members row — the type is set at approval time (see below).
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
  v_account_type    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This account cannot request to join as a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
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


-- ─── 11. approve_join_request ────────────────────────────────────────────────
-- Defense in depth: create_join_request already blocks an OWNER/ADMIN
-- requester at creation time — re-checked here too, immediately before the
-- club_members INSERT, in case the requester's account type changed
-- between request and approval. Same validation/shared-resolution behavior
-- as before (20260803000001) — CREATE OR REPLACE, safe to reapply.
-- reject_join_request is untouched: it never creates a club_members row.
CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_request       public.club_join_requests;
  v_club_name     text;
  v_club_slug     text;
  v_account_type  text;
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

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = v_request.profile_id;
  IF v_account_type IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'This requester cannot become a player — its account type is %', v_account_type
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_request.club_id, v_request.profile_id, 'PLAYER', true)
  ON CONFLICT (club_id, profile_id) DO NOTHING;

  UPDATE public.profiles SET account_type = 'PLAYER' WHERE id = v_request.profile_id AND account_type IS NULL;

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

  UPDATE public.notifications
  SET resolved_status = 'approved', resolved_at = now()
  WHERE type = 'join_request_created'
    AND (metadata->>'join_request_id')::uuid = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;


-- ─── 12. claim_invitation ────────────────────────────────────────────────────
-- invitation_links.role is 'ADMIN' or 'PLAYER' (never 'OWNER' — there is no
-- OWNER-invite path). Branches accordingly:
--   ADMIN → the profile must be completely untyped AND have zero
--           club_members history of any kind, ever — the one narrow,
--           permanent PLAYER→ADMIN exception.
--   PLAYER → the profile must not already be typed OWNER or ADMIN
--           (already-PLAYER-elsewhere is fine — PLAYER is multi-club).
-- Same token/expiry/max-uses validation and same already-a-member
-- short-circuit as before (20260611000002) — CREATE OR REPLACE, safe to
-- reapply. get_invitation_preview is untouched (read-only, no membership
-- created).
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
