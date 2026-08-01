-- ============================================================
-- SUPERADMIN configuration bypass for pending (unclaimed) clubs
-- Mi Pádel Club
-- ============================================================
-- Fills the gap deliberately left open by 20261003000001_club_claim_flow
-- ("SUPERADMIN configuring courts/operating hours/pricing/branding... is a
-- follow-up"): a platform admin can now act as if they were the OWNER of a
-- SPECIFIC club, but strictly ONLY while that club has never been claimed.
--
-- Scope guard, mechanically enforced everywhere below: every single
-- addition in this migration is gated on
--   profiles.is_platform_admin = true  AND  clubs.pending_claim = true
-- via the one helper function defined first. A club that has ever been
-- claimed has pending_claim = false FOREVER (claim_club flips it exactly
-- once, one-way, and no code path — including everything added here —
-- ever sets it back to true); a normal club created through
-- create_club_with_owner is pending_claim = false from birth. So this
-- bypass structurally cannot apply to any club with a real, historical, or
-- current OWNER — it is not, and can never become, an ownership-transfer
-- mechanism between two real OWNERs.
--
-- Approach, deliberately NOT a redefinition of club_role()/is_club_member()
-- (which would silently extend SUPERADMIN's reach into every table that
-- calls them, including ones never audited for this — reservations,
-- tournaments, sport/ranking, news): every table/RPC below gets its own
-- new, ADDITIVE policy (RLS policies are OR'd together — this never edits
-- or replaces an existing policy's expression, only adds a narrowly-scoped
-- extra one alongside it) or its own explicit, individually-audited extra
-- OR-branch inside its existing authorization check. Nothing outside the
-- specific list below (courts, club_operating_hours, club_pricing_rules/
-- _prices, invitation_links, club_members read, club-assets storage, and
-- clubs itself) is touched — no blind global replacement.
--
-- TS-layer note: every action file this pairs with (courts/actions.ts,
-- settings/actions.ts, dashboard/onboarding/actions.ts, admin/team/
-- actions.ts) still keeps its own membership check as the first, friendly
-- early-return — exactly the existing convention throughout this codebase,
-- where the TS check is never the real enforcement. The RLS policies and
-- RPC bodies below are what actually make each operation possible or
-- impossible; see src/lib/platformAdmin.ts's isSuperadminPendingClubBypass
-- for the matching TS-side check added alongside this migration.
-- ============================================================

-- ─── is_platform_admin_for_pending_club ────────────────────────────────────
-- The one shared, NULL-safe primitive every addition below calls. EXISTS
-- never evaluates to NULL (only true/false), so this is safe to use
-- directly inside RLS USING/WITH CHECK expressions and PL/pgSQL IF
-- conditions alike — never the "NULL treated as false inside IF, but
-- meant to be a deny" trap this codebase has hit before (see
-- 20260825000001, 20261003000002).

CREATE OR REPLACE FUNCTION public.is_platform_admin_for_pending_club(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles me
    JOIN public.clubs c ON c.id = p_club_id
    WHERE me.id = auth.uid()
      AND me.is_platform_admin = true
      AND c.pending_claim = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin_for_pending_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_for_pending_club(uuid) TO authenticated;

-- ─── clubs ──────────────────────────────────────────────────────────────────
-- SELECT: needed so [club]/layout.tsx and [club]/admin/layout.tsx can even
-- resolve a pending club by slug for a SUPERADMIN viewer (the existing
-- clubs_select_active policy requires is_active=true, which a pending club
-- never has; clubs_select_own_member requires a club_members row, which a
-- SUPERADMIN never has either).
CREATE POLICY "clubs_select_superadmin_pending"
  ON public.clubs FOR SELECT
  USING (public.is_platform_admin_for_pending_club(id));

-- UPDATE: covers every direct `clubs` table write used by branding/
-- location/social/settings screens (updateClubCover, updateClubLogo,
-- updateClubName, updateAllowedDurations, addGalleryImage,
-- removeGalleryImage in settings/actions.ts; updateClubIdentity,
-- updateClubLocation, updateClubSocial in dashboard/onboarding/actions.ts)
-- — all of them are plain `.from("clubs").update(...)` calls gated only by
-- this table's RLS, no RPC involved. pending_claim itself stays protected
-- regardless: clubs_protect_pending_claim (20261003000001) still rejects
-- any change to that specific column from current_user IN
-- ('anon','authenticated') — which a SUPERADMIN's session always is at the
-- Postgres role level — so this policy can never be used to un-claim a
-- club or fake a pending state; it only ever affects every OTHER column.
CREATE POLICY "clubs_update_superadmin_pending"
  ON public.clubs FOR UPDATE
  USING (public.is_platform_admin_for_pending_club(id))
  WITH CHECK (public.is_platform_admin_for_pending_club(id));

-- ─── courts ─────────────────────────────────────────────────────────────────
CREATE POLICY "courts_select_superadmin_pending"
  ON public.courts FOR SELECT
  USING (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "courts_insert_superadmin_pending"
  ON public.courts FOR INSERT
  WITH CHECK (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "courts_update_superadmin_pending"
  ON public.courts FOR UPDATE
  USING (public.is_platform_admin_for_pending_club(club_id));

-- No DELETE policy needed — court deletion only ever goes through the
-- delete_court RPC (patched below), never a direct table delete; courts
-- has no DELETE policy for anyone, OWNER/ADMIN included.

-- ─── club_operating_hours ───────────────────────────────────────────────────
-- saveOperatingHours does a single upsert(onConflict: club_id,day_of_week)
-- — needs both INSERT and UPDATE, never DELETE (rows are never removed).
CREATE POLICY "operating_hours_select_superadmin_pending"
  ON public.club_operating_hours FOR SELECT
  USING (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "operating_hours_insert_superadmin_pending"
  ON public.club_operating_hours FOR INSERT
  WITH CHECK (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "operating_hours_update_superadmin_pending"
  ON public.club_operating_hours FOR UPDATE
  USING (public.is_platform_admin_for_pending_club(club_id))
  WITH CHECK (public.is_platform_admin_for_pending_club(club_id));

-- ─── club_pricing_rules / club_pricing_rule_prices ──────────────────────────
-- Rule create/update actually goes through upsert_pricing_rule_with_prices
-- (SECURITY DEFINER, patched below, bypasses this table's RLS internally)
-- — the INSERT/UPDATE policies here are read/toggle-path coverage
-- (togglePricingRuleActive is a direct table update) plus defense in depth
-- in case of any future direct-write path. Prices themselves are only
-- ever read directly (to populate the edit form); writes always go
-- through the same RPC.
CREATE POLICY "pricing_rules_select_superadmin_pending"
  ON public.club_pricing_rules FOR SELECT
  USING (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "pricing_rules_insert_superadmin_pending"
  ON public.club_pricing_rules FOR INSERT
  WITH CHECK (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "pricing_rules_update_superadmin_pending"
  ON public.club_pricing_rules FOR UPDATE
  USING (public.is_platform_admin_for_pending_club(club_id))
  WITH CHECK (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "pricing_prices_select_superadmin_pending"
  ON public.club_pricing_rule_prices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_pricing_rules r
      WHERE r.id = pricing_rule_id AND public.is_platform_admin_for_pending_club(r.club_id)
    )
  );

-- ─── invitation_links (ADMIN invites — the exact existing mechanism) ───────
-- No new invitation system: same table, same claim_invitation/
-- get_invitation_preview RPCs, same /invite/[token] page, all completely
-- untouched. Only who may CREATE/list/revoke a link for a pending club is
-- extended.
CREATE POLICY "invitation_links_select_superadmin_pending"
  ON public.invitation_links FOR SELECT
  USING (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "invitation_links_insert_superadmin_pending"
  ON public.invitation_links FOR INSERT
  WITH CHECK (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "invitation_links_update_superadmin_pending"
  ON public.invitation_links FOR UPDATE
  USING (public.is_platform_admin_for_pending_club(club_id));

-- ─── club_members (read + admin-removal only) ──────────────────────────────
-- SELECT: so a SUPERADMIN can see an ADMIN who has already accepted their
-- invitation before the club is claimed (Equipo/Team screen).
-- UPDATE: needed for removeAdmin (team/actions.ts), a direct
-- `.update({is_active:false})` — the only club_members write this bypass
-- covers. No INSERT policy: rows are only ever created by
-- claim_invitation (SECURITY DEFINER, bypasses RLS internally), never a
-- direct client insert, for ANY caller including this one.
CREATE POLICY "club_members_select_superadmin_pending"
  ON public.club_members FOR SELECT
  USING (public.is_platform_admin_for_pending_club(club_id));

CREATE POLICY "club_members_update_superadmin_pending"
  ON public.club_members FOR UPDATE
  USING (public.is_platform_admin_for_pending_club(club_id))
  WITH CHECK (public.is_platform_admin_for_pending_club(club_id));

-- ─── upsert_pricing_rule_with_prices — extend, don't replace the OWNER check
-- Only the authorization line changes; every other line is byte-identical
-- to 20261003000002 (which itself only changed <> to IS DISTINCT FROM —
-- this migration doesn't touch that fix, only adds one more OR-branch to
-- the same NULL-safe condition).
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
  IF public.club_role(p_club_id) IS DISTINCT FROM 'OWNER'
     AND NOT public.is_platform_admin_for_pending_club(p_club_id)
  THEN
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

-- ─── delete_court — extend, don't replace the OWNER/ADMIN check ───────────
-- Everything else (row lock, reservation-history check, error codes) is
-- byte-identical to 20261002000001 — only the authorization line gains one
-- extra OR-branch.
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
  IF (v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN'))
     AND NOT public.is_platform_admin_for_pending_club(v_club_id)
  THEN
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

-- ─── club-assets storage (logo/cover/gallery uploads) ──────────────────────
-- Additive policies alongside the existing club_assets_insert/_update/
-- _delete (OWNER+ADMIN) from 20260726000001 — those are untouched.
CREATE POLICY "club_assets_insert_superadmin_pending"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND public.is_platform_admin_for_pending_club(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "club_assets_update_superadmin_pending"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND public.is_platform_admin_for_pending_club(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "club_assets_delete_superadmin_pending"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND public.is_platform_admin_for_pending_club(((storage.foldername(name))[2])::uuid)
  );
