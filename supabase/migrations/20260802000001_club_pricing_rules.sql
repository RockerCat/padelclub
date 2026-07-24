-- ============================================================
-- club_pricing_rules — base tariff rules per club (schema only)
-- Mi Pádel Club
-- ============================================================
-- Pure architecture phase: this migration creates the table, its
-- validations, its court/club consistency check, and its overlap
-- prevention — nothing in the app writes to it yet, and no seed rows
-- are inserted here. A club with zero rows simply has no configured
-- tariffs (resolveReservationPrice must treat that as "no applicable
-- rate", never as an error).
--
-- Scope for this phase, deliberately minimal (see audit): only two
-- levels of specificity (court-specific overrides club-general), no
-- priority column, no validity windows, no promotions/holidays/player
-- types/memberships. Those are explicitly out of scope until a real
-- need is confirmed.
-- ============================================================

CREATE TABLE public.club_pricing_rules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid        NOT NULL REFERENCES public.clubs(id)  ON DELETE CASCADE,
  court_id          uuid        REFERENCES public.courts(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  days_of_week      integer[]   NOT NULL,
  start_time        time        NOT NULL,
  end_time          time        NOT NULL,
  price_per_hour    numeric(10,2) NOT NULL,
  currency          text        NOT NULL DEFAULT 'COP',
  display_order     integer     NOT NULL DEFAULT 0,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- days_of_week: same convention as club_operating_hours.day_of_week
  -- (0=domingo … 6=sábado, matches JS Date.getDay()) — never a second
  -- convention for "day of week" in this schema.
  --
  -- club_pricing_rules_days_valid uses the array containment operator
  -- (<@) rather than "NOT EXISTS (SELECT ... FROM unnest(...))" —
  -- PostgreSQL flatly rejects any subquery inside a CHECK constraint
  -- ("cannot use subquery in check constraint"), even one that only
  -- unnests the row's own column with no other table involved. <@ is a
  -- plain array operator, not a subquery, so it's valid here.
  CONSTRAINT club_pricing_rules_days_not_empty
    CHECK (array_length(days_of_week, 1) >= 1),
  CONSTRAINT club_pricing_rules_days_valid
    CHECK (days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]),

  -- [start_time, end_time) — end_time inclusive-of-midnight is expressed
  -- as '00:00:00' meaning "end of day" (interpreted as 24:00 for overlap
  -- purposes, see check_pricing_rule_overlap() below), never as "start of
  -- day". A franja that crosses midnight into the next day (e.g. 22:00–
  -- 02:00) is out of scope for this phase — only end_time='00:00:00' is
  -- accepted as an end-of-day marker, any other end_time must be strictly
  -- after start_time.
  CONSTRAINT club_pricing_rules_time_range_valid
    CHECK (end_time > start_time OR end_time = '00:00:00'::time),

  CONSTRAINT club_pricing_rules_price_non_negative
    CHECK (price_per_hour >= 0),
  CONSTRAINT club_pricing_rules_currency_not_blank
    CHECK (btrim(currency) <> ''),
  CONSTRAINT club_pricing_rules_name_not_blank
    CHECK (btrim(name) <> ''),
  CONSTRAINT club_pricing_rules_display_order_non_negative
    CHECK (display_order >= 0)
);

CREATE INDEX idx_club_pricing_rules_club          ON public.club_pricing_rules (club_id);
CREATE INDEX idx_club_pricing_rules_club_active    ON public.club_pricing_rules (club_id, is_active);
CREATE INDEX idx_club_pricing_rules_court          ON public.club_pricing_rules (court_id);

CREATE TRIGGER set_club_pricing_rules_updated_at
  BEFORE UPDATE ON public.club_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Court must belong to the same club as the rule ──────────────────────────
-- CHECK constraints can't safely reference another table, so this is a
-- BEFORE trigger — same reasoning as every other cross-table invariant in
-- this schema that isn't expressible as a plain CHECK/FK.
CREATE OR REPLACE FUNCTION public.check_pricing_rule_court_club()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.court_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.courts
      WHERE id = NEW.court_id AND club_id = NEW.club_id
    ) THEN
      RAISE EXCEPTION 'La cancha % no pertenece al club %', NEW.court_id, NEW.club_id
        USING ERRCODE = '23514'; -- check_violation
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_pricing_rule_court_club_trigger
  BEFORE INSERT OR UPDATE ON public.club_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.check_pricing_rule_court_club();

-- ─── No ambiguous overlaps within the same scope ─────────────────────────────
-- "Same scope" = same club_id AND same court_id (both NULL = general, or
-- exactly the same court — a general rule and a court-specific rule are
-- NEVER considered overlapping here, since the specific one is meant to
-- override the general one, by design). Within that scope, two active
-- rules sharing at least one day (days_of_week && ...) and whose
-- [start,end) ranges intersect are rejected — deterministically, at
-- write time, never resolved later by "most recently created wins".
--
-- Race-safety: an EXCLUDE constraint can't express "array of days
-- overlaps AND half-open time range overlaps AND nullable-equal scope"
-- in one go, so this uses the standard Postgres pattern for custom
-- cross-row invariants under concurrency — pg_advisory_xact_lock keyed
-- on club_id serializes concurrent writers for the SAME club (writers
-- for different clubs never block each other), so the second concurrent
-- transaction's overlap check always runs after the first has either
-- committed (its row is now visible) or rolled back (nothing to
-- conflict with). The lock is transaction-scoped and released
-- automatically at COMMIT/ROLLBACK.
CREATE OR REPLACE FUNCTION public.check_pricing_rule_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_new_start     integer;
  v_new_end       integer;
  v_conflict_id   uuid;
  v_conflict_name text;
BEGIN
  -- Deactivating a rule (or an already-inactive rule being updated) never
  -- needs an overlap check — only active rules can conflict.
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('club_pricing_rules:' || NEW.club_id::text));

  v_new_start := EXTRACT(HOUR FROM NEW.start_time)::integer * 60 + EXTRACT(MINUTE FROM NEW.start_time)::integer;
  v_new_end   := CASE WHEN NEW.end_time = '00:00:00'::time THEN 1440
                      ELSE EXTRACT(HOUR FROM NEW.end_time)::integer * 60 + EXTRACT(MINUTE FROM NEW.end_time)::integer
                 END;

  SELECT r.id, r.name INTO v_conflict_id, v_conflict_name
  FROM public.club_pricing_rules r
  WHERE r.club_id = NEW.club_id
    AND r.is_active = true
    AND r.id IS DISTINCT FROM NEW.id
    AND r.court_id IS NOT DISTINCT FROM NEW.court_id
    AND r.days_of_week && NEW.days_of_week
    AND v_new_start < (CASE WHEN r.end_time = '00:00:00'::time THEN 1440
                            ELSE EXTRACT(HOUR FROM r.end_time)::integer * 60 + EXTRACT(MINUTE FROM r.end_time)::integer
                       END)
    AND (EXTRACT(HOUR FROM r.start_time)::integer * 60 + EXTRACT(MINUTE FROM r.start_time)::integer) < v_new_end
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'La regla se solapa con "%": mismo alcance, día y horario ya cubiertos por una regla activa.', v_conflict_name
      USING ERRCODE = '23P01'; -- exclusion_violation
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_pricing_rule_overlap_trigger
  BEFORE INSERT OR UPDATE ON public.club_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.check_pricing_rule_overlap();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.club_pricing_rules ENABLE ROW LEVEL SECURITY;

-- Any active member (OWNER/ADMIN/PLAYER) can read — a player needs the
-- rules to resolve their own reservation's price. No anonymous/public
-- access in this phase.
CREATE POLICY "club_pricing_rules_select_member"
  ON public.club_pricing_rules FOR SELECT
  USING (public.is_club_member(club_id));

-- Only OWNER manages tariffs — commercial policy, not day-to-day
-- operations an ADMIN is assumed to handle (same reasoning already
-- applied to club_operating_hours).
CREATE POLICY "club_pricing_rules_insert_owner"
  ON public.club_pricing_rules FOR INSERT
  WITH CHECK (public.club_role(club_id) = 'OWNER');

CREATE POLICY "club_pricing_rules_update_owner"
  ON public.club_pricing_rules FOR UPDATE
  USING (public.club_role(club_id) = 'OWNER')
  WITH CHECK (public.club_role(club_id) = 'OWNER');

-- No DELETE policy — rules are deactivated via is_active, never hard-
-- deleted, same convention as courts.

GRANT SELECT, INSERT, UPDATE ON public.club_pricing_rules TO authenticated;
