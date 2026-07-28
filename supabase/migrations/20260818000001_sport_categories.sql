-- ============================================================
-- Sport categories catalog — Fase 1 (Módulo deportivo), paso 1
-- Mi Pádel Club
-- ============================================================
-- Single, platform-wide source of truth for the 7 fixed padel skill
-- categories and their sporting order. Never club-configurable, never
-- extended with custom categories — this is a closed, permanent set.
--
-- Design decisions (per the approved Architecture Freeze for Fase 1):
--   - `code` is the primary key (text, not a surrogate id) — every future
--     table that references a category does so by code directly, exactly
--     the same convention `club_members.role`/`clubs.visibility` already
--     use for small fixed sets, just as a real FK target instead of a
--     literal CHECK list repeated across multiple tables (clubs,
--     club_ranking_cycles, club_player_category_changes and
--     club_player_point_movements will all reference `code` once they're
--     introduced in later steps of Fase 1 — none of that wiring happens
--     in this migration).
--   - No Postgres ENUM: consistent with every other fixed set in this
--     schema (role, visibility, reservation status/type, rejection
--     reason), which are all `text` — this project has never used an
--     ENUM type anywhere.
--   - `sort_order` exists specifically because a CHECK constraint can
--     validate membership but cannot express order, and the sporting
--     order (7a weakest .. 1a strongest) is required to determine
--     ascenso/descenso in a later, still-to-be-built step of Fase 1.
--   - No `club_id`: this table is intentionally global and outside the
--     multi-tenant model — it is platform configuration, not club data.
--   - No `updated_at`/update trigger: rows are seeded once below and are
--     never edited afterward by design (immutable reference data).
--   - Nothing else in the schema references this table yet. This
--     migration only creates and seeds the catalog — no other table,
--     function, trigger or RLS policy outside this one is touched.
-- ============================================================

CREATE TABLE public.sport_categories (
  code       text     PRIMARY KEY,
  sort_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_categories_code_format
    CHECK (code IN ('7a', '6a', '5a', '4a', '3a', '2a', '1a')),
  CONSTRAINT sport_categories_sort_order_unique
    UNIQUE (sort_order),
  CONSTRAINT sport_categories_sort_order_range
    CHECK (sort_order BETWEEN 1 AND 7)
);

-- Seed the exact, permanent 7 rows. sort_order ascends from the weakest
-- category (7a = 1) to the strongest (1a = 7) — a "promotion" is always a
-- move to a higher sort_order, a "demotion" always to a lower one.
INSERT INTO public.sport_categories (code, sort_order) VALUES
  ('7a', 1),
  ('6a', 2),
  ('5a', 3),
  ('4a', 4),
  ('3a', 5),
  ('2a', 6),
  ('1a', 7);

-- ─── RLS ─────────────────────────────────────────────────────────────────
-- Non-sensitive, non-club-scoped reference data (equivalent to a hardcoded
-- application constant made queryable) — readable by literally anyone,
-- anon included, with no visibility/membership condition of any kind.
ALTER TABLE public.sport_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sport_categories_select_all"
  ON public.sport_categories FOR SELECT
  USING (true);

-- Table-level GRANT, explicit — RLS alone is not enough (Postgres checks
-- GRANTs before evaluating RLS policies; this exact gap already bit
-- courts/club_operating_hours in 20260624000001/20260624000002).
GRANT SELECT ON public.sport_categories TO anon, authenticated;

-- No INSERT/UPDATE/DELETE grant to anon/authenticated at all, and no RLS
-- policy for those either — this catalog is seeded once, above, and is
-- never editable by any club, any role, or any client-facing action.
