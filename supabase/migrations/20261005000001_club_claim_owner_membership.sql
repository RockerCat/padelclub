-- ============================================================
-- Entrega de Club — real, temporary SUPERADMIN OWNER membership
-- Mi Pádel Club
-- ============================================================
-- Supersedes the "zero club_members rows until claimed" model from
-- 20261003000001/20261004000001 with a new, deliberate product decision:
-- a club created via platform_create_pending_club is now fully active
-- (is_active = true) from the moment it is created, and the creating
-- SUPERADMIN receives a REAL, active club_members OWNER row for it —
-- immediately, atomically, in the same statement that creates the club.
-- The SUPERADMIN can then use every ordinary OWNER flow (branding, public
-- page, location, courts, hours, tarifas, reservations, tournaments,
-- players, ADMIN invitations, ...) with zero bypasses, because they are,
-- for as long as the club stays unclaimed, its real OWNER.
--
-- clubs.pending_claim keeps its exact prior meaning and mechanics
-- (persistent, one-way, unforgeable — see 20261003000001's column
-- comment): it is NOT "does this club lack an owner" anymore (it never
-- really was — see that same comment), it is purely "has this club's
-- one-time claim link still not been used". The only two things that ever
-- change: is_active starts true instead of false, and the club gets a
-- real, temporary OWNER row instead of none at all.
--
-- This is the one deliberate, tightly-scoped exception to the Role
-- Philosophy invariant "SUPERADMIN never holds a club_members row of any
-- kind" (enforce_club_members_account_type_consistency, 20260809000001):
-- a SUPERADMIN may hold exactly one active OWNER row, and only for a club
-- it created itself that still has pending_claim = true. The moment that
-- club is claimed, pending_claim flips to false (permanently — this was
-- already true and remains completely unchanged) and the SUPERADMIN's row
-- is deactivated in the very same transaction — so a SUPERADMIN can never
-- end up as a club's permanent, or even momentarily-unpaired, owner.
--
-- Direct consequence: nearly the entire 20261004000001 bypass surface
-- (is_platform_admin_for_pending_club and every RLS policy/RPC OR-branch
-- built on it) is now REDUNDANT, not merely unnecessary — a SUPERADMIN
-- preparing a pending club satisfies every existing OWNER/ADMIN check
-- (club_role(club_id) = 'OWNER', is_club_member(club_id), the club_assets
-- storage policies, etc.) exactly like any other real OWNER, because it
-- IS one. All of it is dropped below, per "No mantengas dos mecanismos de
-- autorización para la misma operación si la membresía OWNER normal ya la
-- permite." What is kept: the platform-only management of the claim link
-- itself (platform_create_pending_club, platform_generate_club_claim_link,
-- platform_revoke_club_claim_link, get_club_claim_status,
-- get_club_claim_preview) — none of those ever routed through the bypass
-- helper being dropped; they were always, and remain, gated directly on
-- profiles.is_platform_admin.
-- ============================================================

-- ─── 1. enforce_club_members_account_type_consistency — narrow exception ───
-- Same body as 20260809000001, with exactly one new branch inserted before
-- the unconditional SUPERADMIN block. The exception's condition — NEW.role
-- = 'OWNER' AND the target club currently has pending_claim = true — can
-- only ever be satisfied by a row this migration's own functions write:
-- club_members INSERT/UPDATE is fully revoked from `authenticated`
-- (20260809000001 step 7), so the only way any row reaches this trigger at
-- all is through a SECURITY DEFINER function; no normal club ever has
-- pending_claim = true (create_club_with_owner defaults it false, and
-- claim_club flips it false permanently, one-way, the instant it's used).
-- It covers both directions this flow needs:
--   • the INSERT in platform_create_pending_club below, which creates the
--     SUPERADMIN's temporary row while the club it just inserted still has
--     pending_claim = true;
--   • the UPDATE in claim_club below that deactivates that same row —
--     claim_club deliberately deactivates it BEFORE flipping pending_claim
--     to false, so this exact same condition still holds at that instant.
-- Returning NEW immediately also skips check 3 (the ADMIN-single-club /
-- same-role-elsewhere check) — safe and intended: a SUPERADMIN can never
-- hold any other club_members row by construction, so that check would
-- only ever pass trivially for it anyway.
CREATE OR REPLACE FUNCTION public.enforce_club_members_account_type_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_account_type          text;
  v_is_platform_admin     boolean;
  v_conflicting_role      text;
  v_target_pending_claim  boolean;
BEGIN
  SELECT account_type, is_platform_admin INTO v_account_type, v_is_platform_admin
  FROM public.profiles WHERE id = NEW.profile_id;

  IF (v_account_type = 'SUPERADMIN' OR v_is_platform_admin) AND NEW.role = 'OWNER' THEN
    SELECT pending_claim INTO v_target_pending_claim FROM public.clubs WHERE id = NEW.club_id;
    IF v_target_pending_claim IS TRUE THEN
      RETURN NEW;
    END IF;
  END IF;

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

-- Trigger itself is unchanged (same name, same timing) — CREATE OR REPLACE
-- FUNCTION above is all that's needed; no DROP/CREATE TRIGGER required.

-- ─── 2. platform_create_pending_club — is_active=true + real OWNER row ─────
-- Atomic: club insert + club_members OWNER insert, both in the same
-- function invocation (PostgreSQL functions execute inside the caller's
-- transaction — if either statement fails, both roll back together). No
-- technical/placeholder profile is created — auth.uid() is genuinely the
-- calling SUPERADMIN, exactly as create_club_with_owner does for a normal
-- OWNER. account_type is deliberately left untouched here (unlike
-- create_club_with_owner's `UPDATE profiles SET account_type = 'OWNER'
-- WHERE account_type IS NULL`): the caller's account_type is always
-- already 'SUPERADMIN' (never NULL for a real platform admin in normal
-- operation), and must stay 'SUPERADMIN' — account_type is permanent
-- once set (enforce_account_type_immutable), so this must never attempt
-- to write 'OWNER' over it.
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
  VALUES (v_club_id, p_name, p_slug, p_visibility, true, true);

  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_club_id, auth.uid(), 'OWNER', true);

  RETURN QUERY SELECT v_club_id, p_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_pending_club(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_create_pending_club(text, text, text) TO authenticated;

-- ─── 3. platform_generate_club_claim_link — fix the now-inverted invariant ──
-- The old secondary assertion ("reject if any active OWNER exists") was
-- written for a model where a pending club never had an owner at all — it
-- would now trip on every single call, since a pending club always has
-- exactly one active OWNER (the SUPERADMIN placeholder) the instant it's
-- created. Replaced with the corrected version of the same defense-in-depth
-- spirit: assert the pending club is still held by exactly one active
-- OWNER, and that OWNER is still the platform-admin placeholder — i.e.
-- that a real transfer hasn't somehow already happened. pending_claim
-- remains the primary, unforgeable guard above this; this is still only a
-- backstop. Everything else in this function is byte-identical to
-- 20261003000001.
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

  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid token_hash format' USING ERRCODE = '22023';
  END IF;

  SELECT pending_claim INTO v_pending_claim FROM public.clubs WHERE id = p_club_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_pending_claim THEN
    RAISE EXCEPTION 'This club is not pending claim — claim links only apply to clubs created via platform_create_pending_club that have never been claimed'
      USING ERRCODE = '23514';
  END IF;

  -- Secondary, defense-in-depth assertion only (see above) — under the new
  -- model a pending club always has exactly one active OWNER, the
  -- platform-admin placeholder created by platform_create_pending_club.
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    JOIN public.profiles p ON p.id = cm.profile_id
    WHERE cm.club_id = p_club_id AND cm.role = 'OWNER' AND cm.is_active = true
      AND (p.account_type = 'SUPERADMIN' OR p.is_platform_admin)
  ) OR (
    SELECT count(*) FROM public.club_members
    WHERE club_id = p_club_id AND role = 'OWNER' AND is_active = true
  ) != 1 THEN
    RAISE EXCEPTION 'This club is not currently held by exactly one platform-admin placeholder OWNER — claim links can only be generated for a club still in that state'
      USING ERRCODE = '23514';
  END IF;

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
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A claim link is already being generated for this club — try again'
      USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.platform_generate_club_claim_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_generate_club_claim_link(uuid, text) TO authenticated;

-- ─── 4. club_claim_events.previous_owner_id — audit trail addition ────────
-- Records who the OWNER was immediately before a successful claim (always
-- the SUPERADMIN placeholder in this flow) alongside the existing actor_id
-- (the new, definitive OWNER who performed the claim) — both sides of the
-- handoff are now on the same audit row, never inferred after the fact.
-- Nullable because every pre-existing event ('generated'/'revoked', and
-- any historical 'claimed' row from before this column existed) has no
-- such value.
ALTER TABLE public.club_claim_events
  ADD COLUMN IF NOT EXISTS previous_owner_id uuid REFERENCES public.profiles(id);

-- ─── 5. claim_club — atomic SUPERADMIN → definitive OWNER transfer ────────
-- Same token/club/status resolution as 20261003000001, with the ownership
-- transfer itself rewritten: instead of a plain INSERT into an ownerless
-- club, this locks every active OWNER row for the club, asserts there is
-- exactly one and that it is the platform-admin placeholder, activates the
-- claimant as OWNER, deactivates the placeholder's row, and only then
-- flips pending_claim to false — all inside the locks already held.
CREATE OR REPLACE FUNCTION public.claim_club(p_token_hash text, p_ip text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link                     public.club_claim_links%ROWTYPE;
  v_club_slug                text;
  v_account_type             text;
  v_is_platform_admin        boolean;
  v_pending_claim            boolean;
  v_owner_count              int;
  v_previous_owner_id        uuid;
  v_previous_owner_is_admin  boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  INSERT INTO public.profiles (id) VALUES (auth.uid())
    ON CONFLICT ON CONSTRAINT profiles_pkey DO NOTHING;

  -- Lock 1/3: the claim link/token row.
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

  -- Lock 2/3: the club row.
  SELECT pending_claim INTO v_pending_claim FROM public.clubs WHERE id = v_link.club_id FOR UPDATE;

  IF NOT v_pending_claim THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  -- Lock 3/3: every active OWNER row for this club — before inspecting or
  -- changing any of them, so a concurrent claim_club call for the same
  -- club can never interleave with this one.
  PERFORM 1 FROM public.club_members
  WHERE club_id = v_link.club_id AND role = 'OWNER' AND is_active = true
  FOR UPDATE;

  SELECT count(*) INTO v_owner_count
  FROM public.club_members
  WHERE club_id = v_link.club_id AND role = 'OWNER' AND is_active = true;

  -- Reject and do NOT attempt to silently repair — either shape here means
  -- something about this club's ownership state is not what
  -- platform_create_pending_club/this same function are supposed to
  -- guarantee, and needs manual review, not an automatic fix.
  IF v_owner_count = 0 THEN
    RAISE EXCEPTION 'Pending club has no active OWNER — data integrity error, requires manual review' USING ERRCODE = '55000';
  ELSIF v_owner_count > 1 THEN
    RAISE EXCEPTION 'Pending club has more than one active OWNER — refusing to claim, requires manual review' USING ERRCODE = '55000';
  END IF;

  SELECT cm.profile_id INTO v_previous_owner_id
  FROM public.club_members cm
  WHERE cm.club_id = v_link.club_id AND cm.role = 'OWNER' AND cm.is_active = true;

  SELECT (p.account_type = 'SUPERADMIN' OR p.is_platform_admin) INTO v_previous_owner_is_admin
  FROM public.profiles p WHERE p.id = v_previous_owner_id;

  IF NOT COALESCE(v_previous_owner_is_admin, false) THEN
    RAISE EXCEPTION 'This club already has a real, non-placeholder owner — claim links only apply to a club still held by its platform-admin placeholder OWNER'
      USING ERRCODE = '23514';
  END IF;

  -- The reclamante cannot be the same SUPERADMIN placeholder OWNER.
  IF v_previous_owner_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_claim_own_placeholder');
  END IF;

  SELECT account_type, is_platform_admin INTO v_account_type, v_is_platform_admin
  FROM public.profiles WHERE id = auth.uid();

  -- No platform admin (this one or any other) may ever become a club's
  -- definitive OWNER — SUPERADMIN's club_members exception above is
  -- strictly limited to the temporary placeholder row, never to this side
  -- of a claim.
  IF v_is_platform_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_type_incompatible');
  END IF;

  IF v_account_type IS NOT NULL AND v_account_type != 'OWNER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_type_incompatible');
  END IF;

  -- Activate the claimant as the club's real, definitive OWNER.
  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_link.club_id, auth.uid(), 'OWNER', true);

  UPDATE public.profiles SET account_type = 'OWNER' WHERE id = auth.uid() AND account_type IS NULL;

  -- Retire the SUPERADMIN's temporary OWNER row. clubs.pending_claim is
  -- still true at this exact instant (flipped only in the next statement
  -- below) — enforce_club_members_account_type_consistency's narrow
  -- exception still applies to this UPDATE, so it is allowed through even
  -- though the profile is a SUPERADMIN.
  UPDATE public.club_members
  SET is_active = false
  WHERE club_id = v_link.club_id AND profile_id = v_previous_owner_id;

  -- Guarantee, asserted rather than assumed: exactly one active OWNER now.
  SELECT count(*) INTO v_owner_count
  FROM public.club_members
  WHERE club_id = v_link.club_id AND role = 'OWNER' AND is_active = true;

  IF v_owner_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly one active OWNER after claim, found %', v_owner_count USING ERRCODE = '55000';
  END IF;

  -- Single statement, using the row lock already held above — flips the
  -- persistent eligibility flag (permanently, one-way) while keeping the
  -- club active, exactly as it already was before the claim.
  UPDATE public.clubs SET pending_claim = false, is_active = true WHERE id = v_link.club_id;

  UPDATE public.club_claim_links
  SET status = 'claimed', claimed_at = now(), claimed_by = auth.uid()
  WHERE id = v_link.id;

  INSERT INTO public.club_claim_events
    (club_id, claim_link_id, event_type, actor_id, ip_address, previous_owner_id)
  VALUES
    (v_link.club_id, v_link.id, 'claimed', auth.uid(), LEFT(NULLIF(TRIM(p_ip), ''), 64), v_previous_owner_id);

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_link.club_id;

  RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_club(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_club(text, text) TO authenticated;

-- ─── 6. Drop the now-redundant 20261004000001 bypass surface ──────────────
-- Every one of these existed only to let a SUPERADMIN act "as if" OWNER
-- for a pending club with zero real membership. That club_members row is
-- now real, so every one of the existing OWNER/ADMIN-gated policies and
-- RPC checks already covers a SUPERADMIN preparing a pending club, with no
-- extra branch. Kept: platform_create_pending_club, platform_generate_
-- club_claim_link, platform_revoke_club_claim_link, get_club_claim_status,
-- get_club_claim_preview — none of these ever depended on the helper or
-- policies dropped here; they are, and remain, gated directly on
-- profiles.is_platform_admin.

DROP POLICY IF EXISTS "clubs_select_superadmin_pending" ON public.clubs;
DROP POLICY IF EXISTS "clubs_update_superadmin_pending" ON public.clubs;

DROP POLICY IF EXISTS "courts_select_superadmin_pending" ON public.courts;
DROP POLICY IF EXISTS "courts_insert_superadmin_pending" ON public.courts;
DROP POLICY IF EXISTS "courts_update_superadmin_pending" ON public.courts;

DROP POLICY IF EXISTS "operating_hours_select_superadmin_pending" ON public.club_operating_hours;
DROP POLICY IF EXISTS "operating_hours_insert_superadmin_pending" ON public.club_operating_hours;
DROP POLICY IF EXISTS "operating_hours_update_superadmin_pending" ON public.club_operating_hours;

DROP POLICY IF EXISTS "pricing_rules_select_superadmin_pending" ON public.club_pricing_rules;
DROP POLICY IF EXISTS "pricing_rules_insert_superadmin_pending" ON public.club_pricing_rules;
DROP POLICY IF EXISTS "pricing_rules_update_superadmin_pending" ON public.club_pricing_rules;
DROP POLICY IF EXISTS "pricing_prices_select_superadmin_pending" ON public.club_pricing_rule_prices;

DROP POLICY IF EXISTS "invitation_links_select_superadmin_pending" ON public.invitation_links;
DROP POLICY IF EXISTS "invitation_links_insert_superadmin_pending" ON public.invitation_links;
DROP POLICY IF EXISTS "invitation_links_update_superadmin_pending" ON public.invitation_links;

DROP POLICY IF EXISTS "club_members_select_superadmin_pending" ON public.club_members;
DROP POLICY IF EXISTS "club_members_update_superadmin_pending" ON public.club_members;

DROP POLICY IF EXISTS "club_assets_insert_superadmin_pending" ON storage.objects;
DROP POLICY IF EXISTS "club_assets_update_superadmin_pending" ON storage.objects;
DROP POLICY IF EXISTS "club_assets_delete_superadmin_pending" ON storage.objects;

-- No remaining reference anywhere (confirmed by grep across every
-- migration before writing this one) — safe to drop outright.
DROP FUNCTION IF EXISTS public.is_platform_admin_for_pending_club(uuid);

-- ─── 7. Revert upsert_pricing_rule_with_prices to its pre-bypass body ──────
-- Byte-identical to 20261003000002 (the NULL-safe IS DISTINCT FROM fix) —
-- only the extra `AND NOT is_platform_admin_for_pending_club(...)`
-- OR-branch 20261004000001 added is removed; that fix itself is untouched.
CREATE OR REPLACE FUNCTION public.upsert_pricing_rule_with_prices(
  p_rule_id uuid,
  p_club_id uuid,
  p_court_id uuid,
  p_name text,
  p_days_of_week integer[],
  p_start_time time,
  p_end_time time,
  p_display_order integer,
  p_prices jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_rule_id        uuid;
  v_price          jsonb;
  v_kept_durations integer[];
BEGIN
  IF public.club_role(p_club_id) IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_rule_id IS NULL THEN
    INSERT INTO public.club_pricing_rules
      (club_id, court_id, name, days_of_week, start_time, end_time, display_order)
    VALUES
      (p_club_id, p_court_id, p_name, p_days_of_week, p_start_time, p_end_time, p_display_order)
    RETURNING id INTO v_rule_id;
  ELSE
    UPDATE public.club_pricing_rules
    SET court_id = p_court_id,
        name = p_name,
        days_of_week = p_days_of_week,
        start_time = p_start_time,
        end_time = p_end_time,
        display_order = p_display_order
    WHERE id = p_rule_id AND club_id = p_club_id
    RETURNING id INTO v_rule_id;

    IF v_rule_id IS NULL THEN
      RAISE EXCEPTION 'Rule not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  FOR v_price IN SELECT jsonb_array_elements(p_prices)
  LOOP
    INSERT INTO public.club_pricing_rule_prices (pricing_rule_id, duration_minutes, price_amount, currency)
    VALUES (
      v_rule_id,
      (v_price->>'duration_minutes')::integer,
      (v_price->>'price_amount')::numeric,
      COALESCE(v_price->>'currency', 'COP')
    )
    ON CONFLICT (pricing_rule_id, duration_minutes)
    DO UPDATE SET
      price_amount = EXCLUDED.price_amount,
      currency = EXCLUDED.currency,
      updated_at = now();
  END LOOP;

  SELECT array_agg((elem->>'duration_minutes')::integer) INTO v_kept_durations
  FROM jsonb_array_elements(p_prices) AS elem;

  DELETE FROM public.club_pricing_rule_prices
  WHERE pricing_rule_id = v_rule_id
    AND NOT (duration_minutes = ANY(COALESCE(v_kept_durations, ARRAY[]::integer[])));

  RETURN v_rule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_pricing_rule_with_prices(uuid, uuid, uuid, text, integer[], time, time, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_pricing_rule_with_prices(uuid, uuid, uuid, text, integer[], time, time, integer, jsonb) TO authenticated;

-- ─── 8. Revert delete_court to its pre-bypass body ─────────────────────────
-- Byte-identical to 20261002000001 — only the extra
-- `AND NOT is_platform_admin_for_pending_club(...)` OR-branch
-- 20261004000001 added is removed.
CREATE OR REPLACE FUNCTION public.delete_court(p_court_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_club_id       uuid;
  v_role          text;
  v_has_activity  boolean;
  v_deleted_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT club_id INTO v_club_id
  FROM public.courts
  WHERE id = p_court_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court not found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.club_role(v_club_id);
  IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to delete courts for this club' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reservations WHERE court_id = p_court_id
  ) INTO v_has_activity;

  IF v_has_activity THEN
    RAISE EXCEPTION 'Court has reservation history and cannot be deleted' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.courts WHERE id = p_court_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'Court not found' USING ERRCODE = 'P0002';
  END IF;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Court has reservation history and cannot be deleted' USING ERRCODE = '23503';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_court(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_court(uuid) TO authenticated;
