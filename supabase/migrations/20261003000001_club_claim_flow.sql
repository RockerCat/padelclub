-- ============================================================
-- Entrega de Club (Club Handoff) — platform-admin prepared clubs
-- Mi Pádel Club
-- ============================================================
-- Lets a SUPERADMIN create a club shell (no owner yet — clubs.is_active
-- stays false and it never gets a club_members row) and hand it off to its
-- real owner via a single-use, hash-stored claim link at /claim-club/<token>.
--
-- Scope, deliberately narrow (see CLAUDE.md → MVP Scope: "club ownership
-- transfer" stays out of scope): this is a ONE-TIME claim of a club that
-- has NEVER had a real owner — never a transfer between two existing
-- OWNERs. platform_generate_club_claim_link and claim_club both refuse to
-- run at all once the target club already has an active OWNER, so this
-- can never be repurposed into a transfer tool for a live club.
--
-- No provisional/placeholder OWNER profile is created anywhere in this
-- flow. It isn't structurally required: a club can simply have zero
-- club_members rows while unclaimed (nothing elsewhere assumes every club
-- has an owner — get_platform_club_detail already LEFT JOINs owner info),
-- and SUPERADMIN can never hold a club_members row itself
-- (enforce_club_members_account_type_consistency rejects it outright), so
-- a shared "system" login would have added risk (a real, must-be-secured
-- credential) without solving anything a zero-member club doesn't already
-- solve more simply.
--
-- Token security: the raw token is generated in TS (crypto.randomBytes,
-- 256 bits) and its SHA-256 hex digest is the only thing ever sent to or
-- stored by these functions — the raw token never reaches the database.
-- This is deliberately stronger than the existing invitation_links flow
-- (which stores its token as plain gen_random_uuid() text) —
-- invitation_links is entirely untouched by this migration; this is a
-- fully independent flow with its own new tables, per the explicit
-- requirement not to reuse it or the join-request flow.
--
-- club_claim_links: at most one 'pending' row per club. Primarily kept
-- true by platform_generate_club_claim_link's own logic (FOR UPDATE lock
-- on clubs serializes concurrent calls for the same club; regenerating
-- revokes the old row before inserting the new one — see that function for
-- the full reasoning). A partial unique index on (club_id) WHERE
-- status = 'pending' backs this up as a database-level invariant that
-- holds even if that application logic is ever bypassed, not as the
-- mechanism a normal double-click is expected to hit.
--
-- Both new tables have RLS enabled with zero policies — every read and
-- write goes through a SECURITY DEFINER function gated on
-- profiles.is_platform_admin (generation/revocation/status), or through
-- the public claim/preview functions below — mirroring the existing
-- platform RPC convention (get_platform_clubs_overview,
-- update_platform_user_name in 20260724000001/20260725000001).
--
-- Deliberately out of scope for this migration: SUPERADMIN configuring a
-- pending club's courts/operating hours/pricing/branding. Those all remain
-- gated exactly as before (active club_members OWNER/ADMIN only) — wiring
-- SUPERADMIN into that surface would mean touching several existing
-- RLS policies/RPCs well outside this flow, which the task explicitly
-- asked not to do. platform_create_pending_club below only creates the
-- club shell (name/slug/visibility); further configuration is a follow-up.
--
-- Eligibility signal (post-review revision): whether a club may still get
-- a claim link generated/claimed is decided by clubs.pending_claim alone
-- (see below), NOT by "does this club currently lack an active OWNER".
-- The latter would have been spoofable — club_members.is_active is
-- directly client-writable (GRANT UPDATE (is_active, category) ON
-- club_members TO authenticated, from 20260610000001), so a club's own
-- real OWNER could deactivate their own membership and make a live,
-- already-owned club look "ownerless" to that check. pending_claim is a
-- one-way flag (true only from platform_create_pending_club at creation,
-- flipped to false permanently by claim_club) on a column that a BEFORE
-- UPDATE trigger (see clubs_protect_pending_claim right after it's added)
-- refuses to let anon/authenticated ever change — so it can never be
-- forged from outside a SECURITY DEFINER function in this file. The "no
-- active OWNER" check is kept as a secondary, defense-in-depth assertion
-- only, never the authoritative one.
-- ============================================================

-- ─── clubs.pending_claim — persistent, unforgeable "still unclaimed" flag ──
-- Plain boolean rather than a second table: clubs already has is_active
-- for "not yet live" (see platform_create_pending_club below), and this is
-- the natural place for "not yet owned" to live too. NOT NULL DEFAULT
-- false means every pre-existing and every normally-created (via
-- create_club_with_owner) club is false from birth — only rows this
-- migration's own platform_create_pending_club inserts ever start true.
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS pending_claim boolean NOT NULL DEFAULT false;

-- Lockdown, via trigger rather than a column-level REVOKE: a first draft of
-- this migration used `REVOKE UPDATE (pending_claim) ON clubs FROM
-- authenticated` and was wrong — PostgreSQL's column-level privileges are
-- additive on top of a table-level grant, never subtractive from one
-- (see the GRANT docs: "column-specific privileges are ADDITIONAL to any
-- table-wide privileges"). clubs has no migration anywhere that revokes
-- authenticated's default table-level UPDATE (confirmed by grep — unlike
-- club_members, which explicitly does `REVOKE INSERT, UPDATE ON
-- club_members FROM authenticated` before selectively re-granting specific
-- columns in 20260809000001), so that column-level REVOKE would have been
-- a silent no-op: authenticated's table-wide UPDATE alone is already
-- sufficient to write any column, including a newly added one. Redoing
-- that same revoke-then-selective-regrant for clubs here would mean
-- enumerating every column the existing branding/settings screens already
-- write — real risk of silently breaking one of them, exactly what this
-- review is trying to avoid.
--
-- A BEFORE UPDATE trigger sidesteps all of that: it only ever fires when
-- pending_claim's value actually changes (IS DISTINCT FROM), and rejects
-- that specific change when current_user is 'anon' or 'authenticated' —
-- the only two roles Supabase's PostgREST/client libraries ever connect
-- as. SECURITY DEFINER functions execute as their owner (the migration
-- role, e.g. postgres) for their entire duration, including any statements
-- and triggers they fire — so claim_club/platform_generate_club_claim_link
-- below are completely unaffected; only a direct client update (bypassing
-- every RPC in this file) is ever blocked. Every other clubs column is
-- untouched by this trigger and keeps working exactly as it does today.
CREATE OR REPLACE FUNCTION public.protect_clubs_pending_claim()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF NEW.pending_claim IS DISTINCT FROM OLD.pending_claim
     AND current_user IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'pending_claim can only be changed by the Entrega de Club platform functions'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clubs_protect_pending_claim ON public.clubs;
CREATE TRIGGER clubs_protect_pending_claim
  BEFORE UPDATE ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_clubs_pending_claim();

-- ─── club_claim_links ─────────────────────────────────────────────────────

CREATE TABLE public.club_claim_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  -- Lowercase SHA-256 hex digest, exactly 64 chars — the only shape
  -- hashClaimToken (src/lib/clubClaim.ts) ever produces, so this can never
  -- reject a legitimate value. Defense in depth: guarantees, at the
  -- database level, that no stored row can ever have a malformed hash —
  -- which is exactly what lets get_club_claim_preview/claim_club treat a
  -- malformed p_token_hash identically to "no such token" with zero extra
  -- code (see those functions below): a malformed value can never equal
  -- any stored token_hash, this CHECK is the reason why that's guaranteed
  -- rather than incidental.
  token_hash  text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'revoked')),
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  revoked_by  uuid REFERENCES public.profiles(id),
  claimed_at  timestamptz,
  claimed_by  uuid REFERENCES public.profiles(id)
);

-- At most one active (pending) claim link per club — DB-enforced, not
-- application logic, so it holds even under a concurrent "generate" race.
CREATE UNIQUE INDEX club_claim_links_one_pending_per_club
  ON public.club_claim_links (club_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX club_claim_links_token_hash_idx ON public.club_claim_links (token_hash);
CREATE INDEX club_claim_links_club_id_idx ON public.club_claim_links (club_id);

ALTER TABLE public.club_claim_links ENABLE ROW LEVEL SECURITY;
-- No policies — every access goes through the SECURITY DEFINER functions
-- below, never a direct client query against this table.
REVOKE ALL ON public.club_claim_links FROM PUBLIC, anon, authenticated;

-- ─── club_claim_events (audit trail) ──────────────────────────────────────
-- No generic audit-log mechanism exists anywhere else in the project (this
-- was confirmed before writing this migration) — this table is scoped
-- specifically to this flow, not a general-purpose audit system.

CREATE TABLE public.club_claim_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  claim_link_id  uuid REFERENCES public.club_claim_links(id) ON DELETE SET NULL,
  event_type     text NOT NULL CHECK (event_type IN ('generated', 'revoked', 'claimed')),
  actor_id       uuid REFERENCES public.profiles(id),
  ip_address     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX club_claim_events_club_id_idx ON public.club_claim_events (club_id, created_at DESC);

ALTER TABLE public.club_claim_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_claim_events FROM PUBLIC, anon, authenticated;

-- ─── platform_create_pending_club ──────────────────────────────────────────
-- Creates a club with NO owner and is_active=false. create_club_with_owner
-- always assigns auth.uid() as OWNER atomically in the same transaction —
-- there is no way to reach a zero-member club through it, and SUPERADMIN
-- could never be that owner anyway, so this is a new, separate entry point.

CREATE OR REPLACE FUNCTION public.platform_create_pending_club(
  p_name text,
  p_slug text,
  p_visibility text DEFAULT 'private'
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility value' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.clubs (id, name, slug, visibility, is_active, pending_claim)
  VALUES (v_club_id, p_name, p_slug, p_visibility, false, true);

  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_pending_club(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_create_pending_club(text, text, text) TO authenticated;

-- ─── platform_generate_club_claim_link ─────────────────────────────────────
-- Also implements "regenerar": generating a new link always atomically
-- revokes whatever pending link already existed for the club first, so
-- there is no separate "regenerate" RPC — same function, same guarantee
-- ("máximo un token activo por club") either way.

CREATE OR REPLACE FUNCTION public.platform_generate_club_claim_link(
  p_club_id uuid,
  p_token_hash text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link_id       uuid;
  v_old_link_id   uuid;
  v_pending_claim boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Defense in depth: hashClaimToken (src/lib/clubClaim.ts) always
  -- produces this exact shape, so a legitimate caller never trips this —
  -- reject early and loudly (this is a write path, unlike the read paths
  -- below which stay silent about format) rather than letting a malformed
  -- value reach the clubs row lock or the table's own CHECK constraint.
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid token_hash format' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE here is load-bearing, not decoration: it holds the clubs
  -- row lock for the rest of this transaction, so a claim_club call
  -- racing against this one (which also locks this same row before
  -- flipping pending_claim to false) can never interleave with the
  -- INSERT below in a way that leaves a fresh pending link on a club that
  -- was claimed a moment earlier — one of the two transactions blocks
  -- until the other fully commits, then re-reads the current value.
  SELECT pending_claim INTO v_pending_claim FROM public.clubs WHERE id = p_club_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  -- The primary, unforgeable guard — see the pending_claim column comment
  -- above for why this replaced an "is there no active OWNER" check.
  IF NOT v_pending_claim THEN
    RAISE EXCEPTION 'This club is not pending claim — claim links only apply to clubs created via platform_create_pending_club that have never been claimed'
      USING ERRCODE = '23514';
  END IF;

  -- Secondary, defense-in-depth assertion only (see above) — should be
  -- impossible to trip given pending_claim already gates this, but stays
  -- cheap insurance against any future drift between the two signals.
  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND role = 'OWNER' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This club already has an active owner — claim links only apply to clubs that have never had one'
      USING ERRCODE = '23514';
  END IF;

  -- Regenerating implicitly revokes whatever pending link existed — log it
  -- as its own 'revoked' event, same as the explicit revoke action does,
  -- so the audit trail reflects what actually happened to that link too.
  UPDATE public.club_claim_links
  SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  WHERE club_id = p_club_id AND status = 'pending'
  RETURNING id INTO v_old_link_id;

  IF v_old_link_id IS NOT NULL THEN
    INSERT INTO public.club_claim_events (club_id, claim_link_id, event_type, actor_id)
    VALUES (p_club_id, v_old_link_id, 'revoked', auth.uid());
  END IF;

  INSERT INTO public.club_claim_links (club_id, token_hash, status, created_by)
  VALUES (p_club_id, p_token_hash, 'pending', auth.uid())
  RETURNING id INTO v_link_id;

  INSERT INTO public.club_claim_events (club_id, claim_link_id, event_type, actor_id)
  VALUES (p_club_id, v_link_id, 'generated', auth.uid());

  RETURN v_link_id;
EXCEPTION
  -- Two concurrent "generate" calls for the SAME club do NOT race each
  -- other into this handler under normal operation: the SELECT ... FOR
  -- UPDATE on clubs above already serializes them. The second call blocks
  -- until the first commits, then proceeds with the now-current state —
  -- pending_claim is still true (generating never changes it, only
  -- claim_club does), so it revokes the first call's just-committed
  -- pending link (the UPDATE ... WHERE status = 'pending' above finds it)
  -- and inserts its own — a clean "last generate wins" regeneration, not
  -- an error, for whichever call runs second. A genuine double-click is
  -- therefore expected to succeed twice, not to raise unique_violation.
  --
  -- This handler is a defense-in-depth backstop for the partial unique
  -- index (club_claim_links_one_pending_per_club) being violated some
  -- other way that doesn't go through the lock above — e.g. a future code
  -- change that inserts a 'pending' row without first taking it, or the
  -- effectively-impossible token_hash collision — turning what would
  -- otherwise be a raw constraint-violation error into a clean,
  -- retry-worthy message instead of asserting this is reachable today.
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A claim link is already being generated for this club — try again'
      USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.platform_generate_club_claim_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_generate_club_claim_link(uuid, text) TO authenticated;

-- ─── platform_revoke_club_claim_link ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.platform_revoke_club_claim_link(p_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.club_claim_links
  SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  WHERE club_id = p_club_id AND status = 'pending'
  RETURNING id INTO v_link_id;

  IF v_link_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.club_claim_events (club_id, claim_link_id, event_type, actor_id)
  VALUES (p_club_id, v_link_id, 'revoked', auth.uid());

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_revoke_club_claim_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_revoke_club_claim_link(uuid) TO authenticated;

-- ─── get_club_claim_status ──────────────────────────────────────────────────
-- Read-only, for the "Entrega del club" section on /platform/clubs/[clubId].
-- Returns the most recent claim_links row for the club (or zero rows if a
-- link was never generated at all — the UI treats that as its own initial
-- state, distinct from the three named states pending/claimed/revoked).

CREATE OR REPLACE FUNCTION public.get_club_claim_status(p_club_id uuid)
RETURNS TABLE (
  status           text,
  created_at       timestamptz,
  claimed_at       timestamptz,
  claimed_by_name  text,
  claimed_by_email text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    l.status,
    l.created_at,
    l.claimed_at,
    p.full_name,
    u.email
  FROM public.club_claim_links l
  LEFT JOIN public.profiles p ON p.id = l.claimed_by
  LEFT JOIN auth.users u ON u.id = l.claimed_by
  WHERE l.club_id = p_club_id
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.is_platform_admin = true
    )
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_club_claim_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_claim_status(uuid) TO authenticated;

-- ─── get_club_claim_preview ─────────────────────────────────────────────────
-- Public (anon-safe), mirrors get_invitation_preview's shape: looks up by
-- hash only (the raw token never reaches the DB), and reports WHY a token
-- doesn't work (claimed/revoked/not_found) so a legitimate link-holder gets
-- an honest message. This is not an enumeration surface — reaching any
-- real answer here requires already possessing the unguessable 256-bit
-- token whose hash is being looked up.

CREATE OR REPLACE FUNCTION public.get_club_claim_preview(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link public.club_claim_links%ROWTYPE;
  v_club public.clubs%ROWTYPE;
BEGIN
  -- No separate format check here on purpose: club_claim_links.token_hash
  -- has a CHECK (token_hash ~ '^[0-9a-f]{64}$'), so no stored row can ever
  -- have a malformed hash — a malformed p_token_hash is therefore
  -- guaranteed to fall through to NOT FOUND via this exact same query,
  -- with no separate code path, no different error code, and no timing
  -- difference (the index lookup itself doesn't validate format before
  -- searching). "Malformed" and "well-formed but nonexistent" are
  -- genuinely indistinguishable here, not just similarly worded.
  SELECT * INTO v_link FROM public.club_claim_links WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'status', 'not_found');
  END IF;

  SELECT * INTO v_club FROM public.clubs WHERE id = v_link.club_id;

  RETURN jsonb_build_object(
    'found',        true,
    'status',        v_link.status,
    'club_name',     v_club.name,
    'club_slug',     v_club.slug,
    'club_logo_url', v_club.logo_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_claim_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_claim_preview(text) TO anon, authenticated;

-- ─── claim_club ─────────────────────────────────────────────────────────────
-- The one-time, atomic handoff. Requires an authenticated caller — signup
-- or login happens BEFORE this is ever called, via the existing, unmodified
-- /auth/signup and /auth/login pages with ?next=/claim-club/<token>, exactly
-- the pattern already used by /invite/[token]. Refuses any profile whose
-- account_type is already set to something other than OWNER — a PLAYER or
-- ADMIN account can never become an OWNER (enforce_account_type_immutable
-- plus the club_members role-consistency trigger would reject the insert
-- below anyway); this check exists purely to return a clean error instead
-- of a raw constraint-violation message.
--
-- p_ip is best-effort audit data ONLY — read nowhere in this function
-- except the final INSERT INTO club_claim_events, never in an
-- authorization decision. Capped defensively at 64 chars (well above the
-- 45-char max textual length of an IPv6 address) in case a caller ever
-- forwards an oversized/garbage header value straight through — matches
-- the same normalization already applied TS-side in getClientIp/
-- sanitizeIp before this parameter is ever populated.

CREATE OR REPLACE FUNCTION public.claim_club(p_token_hash text, p_ip text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link          public.club_claim_links%ROWTYPE;
  v_club_slug     text;
  v_account_type  text;
  v_pending_claim boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Ensure the caller's own profile row exists BEFORE anything reads from
  -- it below (account_type in particular) — never assume the on_auth_user_
  -- created trigger already ran; create_club_with_owner carries the exact
  -- same defensive insert for the same reason (see 20260610000003, which
  -- documents a real historical case of that trigger not firing). profiles
  -- has no NOT NULL column besides id itself (full_name/avatar_url/phone
  -- are nullable, created_at/updated_at default now()) — confirmed against
  -- every ALTER TABLE public.profiles migration, not assumed — so this
  -- insert is valid regardless of which columns exist today.
  INSERT INTO public.profiles (id) VALUES (auth.uid())
    ON CONFLICT ON CONSTRAINT profiles_pkey DO NOTHING;

  -- FOR UPDATE: serializes concurrent claim_club calls against the same
  -- token. Without this, two simultaneous requests could both read
  -- status='pending' under READ COMMITTED before either commits its own
  -- UPDATE below, and — since they're different auth.uid() callers — both
  -- INSERTs into club_members would succeed (they don't collide on
  -- club_members' own UNIQUE(club_id, profile_id)), leaving two OWNERs.
  -- The lock forces the second call to wait for the first to commit, then
  -- re-read the now-'claimed' row and correctly fail with already_claimed.
  --
  -- Same "no separate format check" reasoning as get_club_claim_preview:
  -- the table's own CHECK (token_hash ~ '^[0-9a-f]{64}$') guarantees a
  -- malformed p_token_hash can never match a stored row, so it falls
  -- through to the identical not_found branch below with no distinguishing
  -- code path, error code, or timing signal.
  SELECT * INTO v_link FROM public.club_claim_links WHERE token_hash = p_token_hash FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_link.status = 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  IF v_link.status = 'revoked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'revoked');
  END IF;

  -- Primary, unforgeable guard (see the pending_claim column comment near
  -- the top of this migration) — FOR UPDATE locks the clubs row for the
  -- rest of this transaction, so a concurrent platform_generate_club_
  -- claim_link call touching the same club serializes against this one
  -- instead of interleaving with it.
  SELECT pending_claim INTO v_pending_claim FROM public.clubs WHERE id = v_link.club_id FOR UPDATE;

  IF NOT v_pending_claim THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  -- Secondary, defense-in-depth assertion only — see
  -- platform_generate_club_claim_link's identical comment.
  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_link.club_id AND role = 'OWNER' AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();
  IF v_account_type IS NOT NULL AND v_account_type != 'OWNER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_type_incompatible');
  END IF;

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_link.club_id, auth.uid(), 'OWNER', true);

  UPDATE public.profiles SET account_type = 'OWNER' WHERE id = auth.uid() AND account_type IS NULL;

  -- Single statement, using the row lock already held above — flips both
  -- the persistent eligibility flag (permanently, one-way) and activates
  -- the club in the same UPDATE.
  UPDATE public.clubs SET pending_claim = false, is_active = true WHERE id = v_link.club_id;

  UPDATE public.club_claim_links
  SET status = 'claimed', claimed_at = now(), claimed_by = auth.uid()
  WHERE id = v_link.id;

  INSERT INTO public.club_claim_events (club_id, claim_link_id, event_type, actor_id, ip_address)
  VALUES (v_link.club_id, v_link.id, 'claimed', auth.uid(), LEFT(NULLIF(TRIM(p_ip), ''), 64));

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_link.club_id;

  RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_club(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_club(text, text) TO authenticated;
