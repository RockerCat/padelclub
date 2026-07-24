-- ============================================================
-- club_pricing_rule_prices — fixed price per duration within a rule
-- Mi Pádel Club
-- ============================================================
-- Replaces the proportional model (price_per_hour × durationMinutes/60)
-- with a fixed price configured explicitly for each duration a club has
-- enabled. A pricing rule (club_pricing_rules) still owns club/court/days/
-- hours/name/state — this child table owns only "how much for exactly
-- this many minutes", one row per (rule, duration).
--
-- club_pricing_rules.price_per_hour becomes a legacy field as of this
-- migration: kept (not dropped) so historical rows and any code that
-- hasn't migrated yet still read a value, but no longer NOT NULL — new
-- rules created from here on never populate it (see
-- upsert_pricing_rule_with_prices below). It will be physically removed
-- in a later phase once confirmed unused.
-- ============================================================

ALTER TABLE public.club_pricing_rules
  ALTER COLUMN price_per_hour DROP NOT NULL;

CREATE TABLE public.club_pricing_rule_prices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_rule_id  uuid        NOT NULL REFERENCES public.club_pricing_rules(id) ON DELETE CASCADE,
  duration_minutes integer     NOT NULL,
  price_amount     numeric(10,2) NOT NULL,
  currency         text        NOT NULL DEFAULT 'COP',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT club_pricing_rule_prices_duration_valid
    CHECK (duration_minutes IN (60, 90, 120)),
  CONSTRAINT club_pricing_rule_prices_price_non_negative
    CHECK (price_amount >= 0),
  CONSTRAINT club_pricing_rule_prices_currency_not_blank
    CHECK (btrim(currency) <> ''),
  CONSTRAINT club_pricing_rule_prices_unique_duration
    UNIQUE (pricing_rule_id, duration_minutes)
);

CREATE INDEX idx_club_pricing_rule_prices_rule ON public.club_pricing_rule_prices (pricing_rule_id);

-- Reuses the exact same trigger function every other timestamped table in
-- this schema uses (courts, club_operating_hours, reservations,
-- club_pricing_rules) — never a second "touch updated_at" implementation.
CREATE TRIGGER set_club_pricing_rule_prices_updated_at
  BEFORE UPDATE ON public.club_pricing_rule_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS — same scope as the parent rule, resolved through it ────────────────
-- No club_id/court_id/days/hours duplicated here, so every check goes
-- through the parent row's club_id via club_role()/is_club_member() — the
-- exact same helpers every other table in this schema already uses, never
-- a new one.

ALTER TABLE public.club_pricing_rule_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_pricing_rule_prices_select_member"
  ON public.club_pricing_rule_prices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_pricing_rules r
      WHERE r.id = pricing_rule_id AND public.is_club_member(r.club_id)
    )
  );

CREATE POLICY "club_pricing_rule_prices_insert_owner"
  ON public.club_pricing_rule_prices FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_pricing_rules r
      WHERE r.id = pricing_rule_id AND public.club_role(r.club_id) = 'OWNER'
    )
  );

CREATE POLICY "club_pricing_rule_prices_update_owner"
  ON public.club_pricing_rule_prices FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.club_pricing_rules r
      WHERE r.id = pricing_rule_id AND public.club_role(r.club_id) = 'OWNER'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_pricing_rules r
      WHERE r.id = pricing_rule_id AND public.club_role(r.club_id) = 'OWNER'
    )
  );

-- Unlike club_pricing_rules (no DELETE — whole rules are deactivated, never
-- removed), a single duration's price row IS deleted when that duration
-- stops being one of the club's allowed_reservation_durations (see
-- upsert_pricing_rule_with_prices) — there is no "inactive price" concept
-- to fall back to, only "not offered at this duration anymore".
CREATE POLICY "club_pricing_rule_prices_delete_owner"
  ON public.club_pricing_rule_prices FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.club_pricing_rules r
      WHERE r.id = pricing_rule_id AND public.club_role(r.club_id) = 'OWNER'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_pricing_rule_prices TO authenticated;

-- ─── Atomic create/edit — rule + its prices in one transaction ───────────────
-- A plain client can't safely do "insert/update the rule, then insert/
-- update/delete N price rows" as several independent round trips without
-- risking a half-saved rule if one step fails partway — this RPC does it
-- as a single statement-set inside one function invocation, so Postgres
-- itself guarantees all-or-nothing. SECURITY DEFINER because it writes to
-- club_pricing_rules/club_pricing_rule_prices on the caller's behalf, but
-- it re-checks club_role(...) = 'OWNER' itself first — it does not trust
-- RLS to have already gated the call, same discipline as
-- approve_join_request/reject_join_request.
--
-- p_prices is a jsonb array: [{"duration_minutes":90,"price_amount":70000,
-- "currency":"COP"}, ...]. Passing p_rule_id = NULL creates a new rule;
-- otherwise updates the existing one (club_id is re-validated, never
-- trusted to already match). Existing check_pricing_rule_court_club and
-- check_pricing_rule_overlap triggers on club_pricing_rules still fire
-- normally for the INSERT/UPDATE below — SECURITY DEFINER bypasses RLS,
-- never triggers.
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
  IF public.club_role(p_club_id) <> 'OWNER' THEN
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
