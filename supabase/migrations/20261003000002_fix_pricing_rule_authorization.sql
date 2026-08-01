-- ============================================================
-- Fix authorization bypass in upsert_pricing_rule_with_prices
-- Mi Pádel Club
-- ============================================================
-- Bug (pre-existing, found during an unrelated Entrega de Club security
-- review, confirmed by reading the live function body directly — not
-- assumed): the authorization check was
--
--   IF public.club_role(p_club_id) <> 'OWNER' THEN
--     RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
--   END IF;
--
-- club_role(p_club_id) (20260610000001) returns SQL NULL, not an error or
-- an empty string, for any caller who is not an active member of that
-- specific club. `NULL <> 'OWNER'` evaluates to NULL, and PL/pgSQL's IF
-- treats a NULL condition as false — so the RAISE EXCEPTION was silently
-- skipped. Net effect: any authenticated user, member of that club or not,
-- could call this RPC directly and write pricing rules/prices for ANY
-- club. This is exactly the "NOT IN / negative-comparison over a value
-- that can be NULL" anti-pattern already documented as hard-won elsewhere
-- in this project (see the Sport/Ranking Module fix in
-- 20260825000001_fix_sport_state_authorization_bypass.sql) — same root
-- cause, expressed with <> instead of NOT IN.
--
-- Fix: `IS DISTINCT FROM` is NULL-safe by construction — unlike `<>`, it
-- never itself evaluates to NULL. `NULL IS DISTINCT FROM 'OWNER'` is TRUE,
-- so a non-member (or non-OWNER) caller now correctly raises the
-- exception. `'OWNER' IS DISTINCT FROM 'OWNER'` is FALSE, so a genuine
-- OWNER's access is completely unchanged.
--
-- Scope: this migration touches ONLY this one function's authorization
-- check. The rest of the function body, its signature, and its
-- REVOKE/GRANT are reproduced unchanged from 20260803000002 (CREATE OR
-- REPLACE requires the full body — Postgres has no way to patch a single
-- line of an existing function).
--
-- Confirmed NOT the same bug (audited separately, see the exact `<>`
-- pattern search performed before writing this migration): this exact
-- `club_role(...) <> 'ROLE'` shape appears nowhere else in the codebase —
-- this was the only hit. A related but distinct pattern, `club_role(...)
-- NOT IN ('OWNER', 'ADMIN')` — which has the identical NULL-bypass
-- mechanism — is NOT touched by this migration; it was found in roughly a
-- dozen other functions (reservations, join requests, club statistics,
-- sport-state reads, and more) and is flagged separately as a distinct,
-- larger follow-up, deliberately out of scope here to keep this fix
-- minimal and reviewable on its own.
-- ============================================================

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

  -- Remove any duration this rule previously priced but that isn't in the
  -- submitted set anymore (the club stopped allowing that duration) —
  -- never leaves a stale, unreachable price row behind.
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
