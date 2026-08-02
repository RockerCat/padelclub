-- ============================================================
-- ADMIN access to Club → Configuración
-- Mi Pádel Club
-- ============================================================
-- Widens Ubicación, Operación/horarios, Duraciones permitidas and Tarifas
-- from OWNER-only to OWNER+ADMIN, matching the app-layer change in
-- src/app/(app)/[club]/admin/club/clubHubTabsConfig.ts and
-- settings/actions.ts. "Archivar club" (archive_club) is deliberately NOT
-- touched — it stays OWNER-only, a real ownership/lifecycle action, per
-- this task's explicit requirement.
--
-- Audited before writing this migration: every one of these five sections
-- already funnels through exactly one of two choke points —
--   1. Direct table writes gated by RLS (club_operating_hours,
--      club_pricing_rules.is_active toggle) — widened below by editing the
--      existing OWNER-only policy in place (not a new sibling), since this
--      is a deliberate, permanent product-permission change, not an
--      additive elevated-access carve-out like the SUPERADMIN migration's
--      siblings.
--   2. A SECURITY DEFINER RPC (upsert_pricing_rule_with_prices,
--      configure_club_default_player_category) — widened by editing the
--      RPC's own authorization check.
-- No new, dispersed authorization logic is introduced anywhere — every
-- check already lived in one of these two places.


-- ─── 1. club_operating_hours — OWNER-only → OWNER/ADMIN ────────────────────
-- SUPERADMIN elevated access already has its own additive sibling policies
-- here (operating_hours_insert_superadmin/_update_superadmin,
-- 20261008000001) — untouched, still correct after this change.
DROP POLICY IF EXISTS "owner_insert_operating_hours" ON public.club_operating_hours;
DROP POLICY IF EXISTS "owner_update_operating_hours" ON public.club_operating_hours;
DROP POLICY IF EXISTS "owner_delete_operating_hours" ON public.club_operating_hours;

CREATE POLICY "admins_insert_operating_hours"
  ON public.club_operating_hours FOR INSERT
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "admins_update_operating_hours"
  ON public.club_operating_hours FOR UPDATE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'))
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "admins_delete_operating_hours"
  ON public.club_operating_hours FOR DELETE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));


-- ─── 2. club_pricing_rules — OWNER-only → OWNER/ADMIN ──────────────────────
-- INSERT is unreachable from the app today (createPricingRule always goes
-- through the RPC below, never a direct .insert()) but widened anyway for
-- consistency — leaving a permanently-unreachable OWNER-only INSERT policy
-- next to an OWNER/ADMIN UPDATE one would be a confusing, inconsistent
-- leftover. UPDATE is real and used directly by togglePricingRuleActive
-- (settings/actions.ts), which is exactly why a real SUPERADMIN gap existed
-- here (only a SELECT sibling was ever added for elevated access in
-- 20261008000001 — its comment assumed all writes went through the RPC,
-- which toggle never did) — closed below with its own additive sibling,
-- same shape as every other *_superadmin policy in this codebase.
DROP POLICY IF EXISTS "club_pricing_rules_insert_owner" ON public.club_pricing_rules;
DROP POLICY IF EXISTS "club_pricing_rules_update_owner" ON public.club_pricing_rules;

CREATE POLICY "club_pricing_rules_insert_admin"
  ON public.club_pricing_rules FOR INSERT
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "club_pricing_rules_update_admin"
  ON public.club_pricing_rules FOR UPDATE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'))
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "club_pricing_rules_update_superadmin"
  ON public.club_pricing_rules FOR UPDATE
  USING (public.is_superadmin_club_access(club_id))
  WITH CHECK (public.is_superadmin_club_access(club_id));


-- ─── 3. upsert_pricing_rule_with_prices — OWNER-only → OWNER/ADMIN ─────────
-- Same function 20261008000001 already made SUPERADMIN-aware via
-- effective_club_role — only the allowed-role check itself widens here.
-- COALESCE(..., '') NOT IN (...) keeps this NULL-safe (effective_club_role
-- returns NULL for a real non-member/non-superadmin caller — a bare
-- `role NOT IN (...)` would silently evaluate to NULL there and skip the
-- RAISE, per CLAUDE.md's explicit "never NOT IN over a value that can be
-- NULL" rule).
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
  IF COALESCE(public.effective_club_role(p_club_id), '') NOT IN ('OWNER', 'ADMIN') THEN
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


-- ─── 4. configure_club_default_player_category — add SUPERADMIN fallback ───
-- Already allows OWNER/ADMIN (unchanged) — this function was simply never
-- updated when the SUPERADMIN "Entrar al club" feature landed
-- (20261008000001), since it wasn't in Configuración's scope back then.
-- Now that Categoría de jugadores is one of the sections a SUPERADMIN must
-- reach with OWNER-equivalent access, this adds the exact same Pattern-B
-- union fallback every other inline-lookup RPC in 20261008000001 already
-- uses (e.g. create_tournament) — same column order as
-- club_members%ROWTYPE, same "FOUND" idiom preserved. Everything else
-- (category validation, clubs.default_player_category write,
-- provision_club_sport_members call) is byte-identical to the current live
-- definition (20260825000001).
CREATE OR REPLACE FUNCTION public.configure_club_default_player_category(
  p_club_id  uuid,
  p_category text
)
RETURNS TABLE (category text, cycle_id uuid, provisioned_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member public.club_members%ROWTYPE;
  v_cycle_id    uuid;
  v_provisioned integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, p_club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(p_club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to configure this club' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to configure this club' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sport_categories WHERE code = p_category) THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clubs SET default_player_category = p_category WHERE id = p_club_id;

  SELECT p.cycle_id, p.provisioned_count INTO v_cycle_id, v_provisioned
  FROM public.provision_club_sport_members(p_club_id) p;

  RETURN QUERY SELECT p_category, v_cycle_id, v_provisioned;
END;
$$;
