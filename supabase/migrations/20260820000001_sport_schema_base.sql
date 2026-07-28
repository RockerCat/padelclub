-- ============================================================
-- Sport schema base — Fase 1 (Módulo deportivo), bloque 3
-- Mi Pádel Club
-- ============================================================
-- Creates the four structural tables that store ranking cycles, a
-- player's live sport state within a club, and the two immutable
-- history tables (category changes, point movements) — exactly as
-- fixed in the approved Architecture Freeze. This migration is
-- declarative structure only:
--   - no provisioning function, no find-or-create-cycle logic;
--   - no trigger of any kind;
--   - no RPC, no backfill, no row is ever inserted here;
--   - RLS is enabled on all four new tables with zero policies and no
--     GRANT to anon/authenticated — they are unreachable by any client
--     the moment they exist, exactly as required. service_role already
--     has full access to every future table via the project-wide
--     ALTER DEFAULT PRIVILEGES set up in 20260612000001; anon/authenticated
--     never receive any privilege on a new table unless a migration
--     explicitly GRANTs it (confirmed precedent: 20260624000001, where a
--     missing GRANT caused "permission denied" even with a permissive RLS
--     policy already in place) — so simply issuing no GRANT here is
--     sufficient to keep these tables fully closed; there is nothing to
--     REVOKE, since nothing was ever granted.
--
-- Order (matches the FK dependency chain exactly):
--   1. UNIQUE (id, club_id) on club_members — required so later tables
--      can express a composite FK that ties club_member_id to the same
--      club_id declared on the row, instead of trusting a future RPC.
--   2. club_ranking_cycles — needs only clubs + sport_categories, and
--      gains its own UNIQUE (id, club_id) for the same reason.
--   3. club_member_sport_state — 1:1 extension of club_members, needs
--      both club_members and club_ranking_cycles to already carry their
--      composite UNIQUE keys.
--   4. club_player_category_changes — needs club_members and
--      club_ranking_cycles.
--   5. club_player_point_movements — created last because its
--      category_change_id column references club_player_category_changes.
--
-- Conceptual rollback order is the exact reverse: drop
-- club_player_point_movements, then club_player_category_changes, then
-- club_member_sport_state, then club_ranking_cycles, then the
-- club_members constraint added in step 1 — nothing here is applied yet,
-- so no rollback script is needed for this task.
-- ============================================================


-- ─── 1. club_members — auxiliary composite key ─────────────────────────────
-- No equivalent constraint or index existed before this (club_members only
-- had PRIMARY KEY (id) and UNIQUE (club_id, profile_id) — confirmed by
-- inspection of 20260610000001). Purely additive: no data touched, no
-- existing column changed, primary key untouched.
ALTER TABLE public.club_members
  ADD CONSTRAINT club_members_id_club_id_key UNIQUE (id, club_id);


-- ─── 2. club_ranking_cycles ─────────────────────────────────────────────────
-- One ranking cycle for a (club, category) combination. No cycle is ever
-- created by this migration — the table starts empty. Closing/reopening a
-- cycle is exclusively a future, manual OWNER/ADMIN action (Fase 9); no
-- automatic closing logic exists anywhere, including here.
CREATE TABLE public.club_ranking_cycles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No ON DELETE CASCADE: unlike courts/club_members/club_news/club_join_
  -- requests/club_pricing_rules (current operational configuration, safe
  -- to disappear with the club), a ranking cycle is the anchor every
  -- point movement and category change eventually attaches to — deleting
  -- it silently would delete real competitive history. This mirrors the
  -- one existing precedent for genuinely historical club-scoped data,
  -- reservations.club_id (20260611000007), which also has no ON DELETE
  -- clause for the same reason. Default NO ACTION: a club can never be
  -- hard-deleted while it still has any cycle, forcing an explicit
  -- decision instead of silent loss (in practice this is moot — clubs
  -- are only ever archived via clubs.archived_at, never physically
  -- deleted, per Club Archival Principles).
  club_id    uuid        NOT NULL REFERENCES public.clubs(id),
  category   text        NOT NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_ranking_cycles_id_club_id_key UNIQUE (id, club_id),
  CONSTRAINT club_ranking_cycles_ended_not_before_started
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- At most one active (ended_at IS NULL) cycle per club+category — the
-- declarative guarantee behind "a lo sumo un ciclo activo por combinación".
-- A partial UNIQUE constraint cannot carry a WHERE clause in Postgres, so
-- this is expressed as a partial unique index (no other precedent for this
-- pattern exists in the repo — every other UNIQUE need so far has been
-- unconditional).
CREATE UNIQUE INDEX club_ranking_cycles_one_active_per_club_category
  ON public.club_ranking_cycles (club_id, category)
  WHERE ended_at IS NULL;


-- ─── 3. club_member_sport_state ─────────────────────────────────────────────
-- Strict 1:1 extension of club_members — same shape as profiles extending
-- auth.users (id doubles as PK and FK, no separate surrogate key). No row
-- is created here; no trigger, no provisioning logic. category is
-- deliberately never stored — it is always resolved via cycle_id →
-- club_ranking_cycles.category, the single source of truth for "which
-- category is this player currently in". position/medal are never stored
-- either, for the same reason (always computed, never cached).
--
-- No updated_at/trigger yet: nothing writes to this table in this block,
-- so an unused update trigger would be scaffolding with no current purpose
-- — deferred to the transactional block that actually mutates these rows.
CREATE TABLE public.club_member_sport_state (
  club_member_id   uuid        PRIMARY KEY,
  club_id          uuid        NOT NULL,
  cycle_id         uuid        NOT NULL,
  current_points   integer     NOT NULL DEFAULT 0,
  points_reached_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_member_sport_state_points_non_negative
    CHECK (current_points >= 0),
  -- Declaratively ties this row to a real membership in the exact same
  -- club — the sole reference to club_members (a separate simple FK on
  -- club_member_id alone would be redundant: this composite FK already
  -- forces club_member_id to exist in club_members.id).
  CONSTRAINT club_member_sport_state_member_club_fk
    FOREIGN KEY (club_member_id, club_id)
    REFERENCES public.club_members (id, club_id),
  -- Declaratively ties cycle_id to a cycle that genuinely belongs to the
  -- same club_id declared on this row — closes the exact integrity gap a
  -- plain `cycle_id REFERENCES club_ranking_cycles(id)` could not.
  CONSTRAINT club_member_sport_state_cycle_club_fk
    FOREIGN KEY (cycle_id, club_id)
    REFERENCES public.club_ranking_cycles (id, club_id)
);

-- Ranking listing: all sport states for a given cycle (== club + category),
-- ordered by the two stored tie-break criteria (points desc, then oldest
-- points_reached_at — titles/runner-up/third-place counts are not yet a
-- stored or derivable field anywhere, so they are not part of this index).
CREATE INDEX club_member_sport_state_ranking_idx
  ON public.club_member_sport_state (cycle_id, current_points DESC, points_reached_at ASC);


-- ─── 4. club_player_category_changes ────────────────────────────────────────
-- Immutable, private history of every category change. No public
-- projection of promotions exists yet, or is created here — this table is
-- unreachable by any client role in this migration (see RLS section).
CREATE TABLE public.club_player_category_changes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No ON DELETE CASCADE, same reasoning as club_ranking_cycles.club_id
  -- above: this is an immutable audit trail, not disposable operational
  -- configuration — it must never disappear silently because its club
  -- was deleted. Matches the reservations.club_id precedent.
  club_id           uuid        NOT NULL REFERENCES public.clubs(id),
  club_member_id    uuid        NOT NULL,
  previous_cycle_id uuid        NOT NULL,
  new_cycle_id      uuid        NOT NULL,
  previous_category text        NOT NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT,
  new_category      text        NOT NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT,
  previous_points   integer     NOT NULL,
  previous_position integer,
  change_type       text        NOT NULL,
  comment           text        NOT NULL,
  created_by        uuid        NOT NULL REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT club_player_category_changes_member_club_fk
    FOREIGN KEY (club_member_id, club_id)
    REFERENCES public.club_members (id, club_id),
  CONSTRAINT club_player_category_changes_prev_cycle_club_fk
    FOREIGN KEY (previous_cycle_id, club_id)
    REFERENCES public.club_ranking_cycles (id, club_id),
  CONSTRAINT club_player_category_changes_new_cycle_club_fk
    FOREIGN KEY (new_cycle_id, club_id)
    REFERENCES public.club_ranking_cycles (id, club_id),

  CONSTRAINT club_player_category_changes_cycles_differ
    CHECK (previous_cycle_id <> new_cycle_id),
  CONSTRAINT club_player_category_changes_categories_differ
    CHECK (previous_category <> new_category),
  CONSTRAINT club_player_category_changes_prev_points_non_negative
    CHECK (previous_points >= 0),
  CONSTRAINT club_player_category_changes_prev_position_valid
    CHECK (previous_position IS NULL OR previous_position >= 1),
  CONSTRAINT club_player_category_changes_type_valid
    CHECK (change_type IN ('promotion', 'demotion', 'correction')),
  -- Same trim + 1..500 char convention already used for
  -- reservations.rejection_reason (20260804000001) — comment is always
  -- mandatory here, never conditional on change_type.
  CONSTRAINT club_player_category_changes_comment_length
    CHECK (length(btrim(comment)) BETWEEN 1 AND 500)

  -- Ascenso/descenso validity against sport_categories.sort_order is
  -- intentionally NOT a CHECK here — it depends on comparing this table's
  -- own values against a different table's column, which is the future
  -- transactional function's responsibility, not a declarative constraint.
);

CREATE INDEX club_player_category_changes_member_idx
  ON public.club_player_category_changes (club_member_id, created_at DESC);


-- ─── 5. club_player_point_movements ─────────────────────────────────────────
-- Immutable, append-only ledger. No row is created here, including no
-- technical category-change movement — this migration only prepares the
-- constraints that will govern its future creation.
CREATE TABLE public.club_player_point_movements (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No ON DELETE CASCADE, same reasoning as the two tables above: this is
  -- the immutable, reconstructive points ledger — it must never disappear
  -- silently because its club was deleted. Matches the reservations.club_id
  -- precedent.
  club_id            uuid        NOT NULL REFERENCES public.clubs(id),
  club_member_id     uuid        NOT NULL,
  cycle_id           uuid        NOT NULL,
  category           text        NOT NULL REFERENCES public.sport_categories(code) ON DELETE RESTRICT,
  previous_total     integer     NOT NULL,
  new_total          integer     NOT NULL,
  delta              integer     NOT NULL,
  adjustment_mode    text        NOT NULL,
  origin             text        NOT NULL,
  system_event_code  text,
  reason_code        text,
  comment            text        NOT NULL,
  category_change_id uuid REFERENCES public.club_player_category_changes(id),
  created_by         uuid        NOT NULL REFERENCES public.profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT club_player_point_movements_member_club_fk
    FOREIGN KEY (club_member_id, club_id)
    REFERENCES public.club_members (id, club_id),
  CONSTRAINT club_player_point_movements_cycle_club_fk
    FOREIGN KEY (cycle_id, club_id)
    REFERENCES public.club_ranking_cycles (id, club_id),

  CONSTRAINT club_player_point_movements_prev_total_non_negative
    CHECK (previous_total >= 0),
  CONSTRAINT club_player_point_movements_new_total_non_negative
    CHECK (new_total >= 0),
  -- Delta is always the EFFECTIVE change, never the originally-requested
  -- one — this holds even when a subtraction was floored to zero, since
  -- new_total already reflects the floor by the time this row is written.
  CONSTRAINT club_player_point_movements_delta_matches_totals
    CHECK (delta = new_total - previous_total),
  CONSTRAINT club_player_point_movements_mode_valid
    CHECK (adjustment_mode IN ('delta', 'set')),
  CONSTRAINT club_player_point_movements_origin_valid
    CHECK (origin IN ('manual', 'system')),
  CONSTRAINT club_player_point_movements_system_event_valid
    CHECK (system_event_code IS NULL OR system_event_code = 'category_change'),
  -- The 6 fixed manual reason codes from the Architecture Freeze catalog,
  -- one code per approved business motivo (no exact code strings were
  -- ever dictated verbatim, so these follow the short snake_case
  -- convention already established by reservations.rejection_reason_code,
  -- 20260804000001, rather than storing the Spanish label directly):
  --   internal_league            — "Liga interna"
  --   coach_clinic               — "Clínica con el entrenador"
  --   no_show_penalty            — "Sanción por no presentarse"
  --   club_representation_bonus  — "Bonus por representar al club"
  --   special_event              — "Evento especial" (deliberately not
  --                                 special_anniversary/anniversary_event:
  --                                 the approved spec itself restated this
  --                                 motivo both as "evento especial de
  --                                 aniversario" and, later, plain "evento
  --                                 especial" — coding it as the broader,
  --                                 occasion-agnostic concept avoids
  --                                 permanently misnaming every future use
  --                                 that isn't literally an anniversary)
  --   other                      — "Otro" (free-text comment carries the
  --                                 actual reason, same pattern as
  --                                 reservation rejection's own "other")
  -- Exactly these 6, no more — this is a closed, stable, long-term
  -- catalog, not a place for speculative future motivos.
  CONSTRAINT club_player_point_movements_reason_code_valid
    CHECK (
      reason_code IS NULL OR reason_code IN (
        'internal_league',
        'coach_clinic',
        'no_show_penalty',
        'club_representation_bonus',
        'special_event',
        'other'
      )
    ),
  CONSTRAINT club_player_point_movements_comment_length
    CHECK (length(btrim(comment)) BETWEEN 1 AND 500),
  -- Exactly one of {reason_code (manual), system_event_code (system)} is
  -- populated — never both, never neither.
  CONSTRAINT club_player_point_movements_origin_reason_consistency
    CHECK (
      (origin = 'manual' AND reason_code IS NOT NULL AND system_event_code IS NULL)
      OR
      (origin = 'system' AND system_event_code IS NOT NULL AND reason_code IS NULL)
    ),
  -- No orphan technical movement, no manual movement disguised as a
  -- category-change reset.
  CONSTRAINT club_player_point_movements_category_change_id_consistency
    CHECK (
      (origin = 'manual' AND category_change_id IS NULL)
      OR
      (origin = 'system' AND system_event_code = 'category_change' AND category_change_id IS NOT NULL)
    ),
  -- The technical reset movement is always an absolute assignment to zero
  -- — combined with the delta CHECK above, this also forces
  -- delta = -previous_total for this exact case, with no separate
  -- constraint needed for that.
  CONSTRAINT club_player_point_movements_category_change_is_set_to_zero
    CHECK (system_event_code IS DISTINCT FROM 'category_change' OR (adjustment_mode = 'set' AND new_total = 0))
);

-- At most one technical movement per category change — declarative
-- guarantee behind "un único movimiento técnico por cambio de categoría".
-- Partial unique index for the same reason as club_ranking_cycles above:
-- the uniqueness only applies when category_change_id is not null.
CREATE UNIQUE INDEX club_player_point_movements_one_per_category_change
  ON public.club_player_point_movements (category_change_id)
  WHERE category_change_id IS NOT NULL;

CREATE INDEX club_player_point_movements_member_cycle_idx
  ON public.club_player_point_movements (club_member_id, cycle_id, created_at DESC);


-- ─── RLS — tables born closed ───────────────────────────────────────────────
-- Enabled with zero policies on all four tables: no role other than
-- service_role/table owner (which bypass RLS entirely) can read or write
-- anything here yet. Combined with no GRANT to anon/authenticated (see the
-- header comment), this is a complete, structural deny-by-default — the
-- functional read/write policies for OWNER/ADMIN/PLAYER are explicitly
-- deferred to the future block that implements the real operations.
ALTER TABLE public.club_ranking_cycles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_member_sport_state       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_player_category_changes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_player_point_movements   ENABLE ROW LEVEL SECURITY;
