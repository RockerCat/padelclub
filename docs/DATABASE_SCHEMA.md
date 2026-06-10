# PadelClub — Database Schema

> PostgreSQL via Supabase. All timestamps are `timestamptz` (UTC).
> Multi-tenant boundary: `club_id` present on every tenant-scoped table.
> Last updated: 2026-06-10 (rev 2 — player model, pairs note, reservation_players future note, ranking_rules recommendation)

---

## Player Model

**There is no `players` table in PadelClub.**

A "player" is not a separate entity — it is a role within a club membership. The model is:

```
auth.users (Supabase-managed)
    │ 1:1 (trigger on signup)
    ▼
profiles          ← global user identity (name, avatar, phone)
    │ 1:N
    ▼
club_members      ← membership in a specific club, with role
  role: OWNER | ADMIN | PLAYER
```

When an admin views the "players" screen, they are querying `club_members JOIN profiles WHERE role = 'PLAYER'`.

**Why not a separate `players` table?** A separate table would duplicate information already in `profiles` and `club_members`, create sync problems when a user belongs to multiple clubs, and complicate RLS policies unnecessarily. The role field in `club_members` is the correct place to express "this user is a player in this club."

---

## Multi-Tenancy Principles

1. **Every tenant-scoped table has `club_id uuid NOT NULL`.**
2. **RLS is enabled on every table.** No row is accessible without a policy.
3. **Helper functions** (`auth.club_role`) avoid N+1 in RLS policies.
4. **`club_id` is denormalized** into child tables (e.g., `ranking_entries`) so RLS never needs a JOIN to enforce tenancy.
5. **`auth.users` is Supabase-managed.** `profiles` extends it via 1:1 relationship triggered on signup.

---

## RLS Helper Functions

```sql
-- Returns the role of the current user in a given club, or NULL if not a member.
-- STABLE = Postgres caches result per transaction → fast RLS policies.
CREATE OR REPLACE FUNCTION auth.club_role(p_club_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.club_members
  WHERE club_id = p_club_id
    AND profile_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Convenience: returns TRUE if the current user is an active member of the club.
CREATE OR REPLACE FUNCTION auth.is_club_member(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND profile_id = auth.uid()
      AND is_active = true
  );
$$;
```

---

## Tables

---

### `clubs`

The tenant root. One row per club.

```sql
CREATE TABLE clubs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,          -- URL-safe, e.g. "platino-padel"
  name            text NOT NULL,
  description     text,
  logo_url        text,                          -- Supabase Storage URL
  primary_color   text NOT NULL DEFAULT '#B7E000',
  secondary_color text NOT NULL DEFAULT '#1698BE',
  bg_color        text NOT NULL DEFAULT '#001A24',
  whatsapp        text,                          -- phone number string
  facebook        text,                          -- URL
  instagram       text,                          -- URL
  youtube         text,                          -- URL
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_clubs_slug ON clubs (slug);

-- RLS
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Anyone can read active clubs (needed for marketing / slug resolution)
CREATE POLICY "clubs_select_active"
  ON clubs FOR SELECT USING (is_active = true);

-- Only owners can update their club
CREATE POLICY "clubs_update_owner"
  ON clubs FOR UPDATE
  USING (auth.club_role(id) = 'OWNER');
```

---

### `profiles`

Extends `auth.users` (1:1). Created automatically via trigger on user signup.

```sql
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  avatar_url  text,                              -- Supabase Storage URL
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read any profile (needed for displaying player names across the app)
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT TO authenticated USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE USING (id = auth.uid());

-- Trigger: create profile row on auth.users INSERT
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

### `club_members`

Junction table: profiles ↔ clubs with role assignment.

```sql
CREATE TABLE club_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'PLAYER')),
  is_active   boolean NOT NULL DEFAULT true,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profile_id)
);

-- Indexes
CREATE INDEX idx_club_members_club     ON club_members (club_id);
CREATE INDEX idx_club_members_profile  ON club_members (profile_id);
CREATE INDEX idx_club_members_role     ON club_members (club_id, role);

-- RLS
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of their club
CREATE POLICY "club_members_select"
  ON club_members FOR SELECT
  USING (auth.is_club_member(club_id));

-- Only owners and admins can manage membership
CREATE POLICY "club_members_insert"
  ON club_members FOR INSERT
  WITH CHECK (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "club_members_update"
  ON club_members FOR UPDATE
  USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `invitation_links`

Allows admins to invite players without manually creating accounts.

```sql
CREATE TABLE invitation_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  role        text NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('ADMIN', 'PLAYER')),
  created_by  uuid NOT NULL REFERENCES profiles(id),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  max_uses    integer DEFAULT NULL,              -- NULL = unlimited
  uses        integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitation_links_token   ON invitation_links (token);
CREATE INDEX idx_invitation_links_club    ON invitation_links (club_id);

ALTER TABLE invitation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitation_links_select_admin"
  ON invitation_links FOR SELECT
  USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "invitation_links_insert_admin"
  ON invitation_links FOR INSERT
  WITH CHECK (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `courts`

Physical courts within a club.

```sql
CREATE TABLE courts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name        text NOT NULL,                     -- "Cancha 1", "Cancha Principal"
  description text,
  surface     text,                              -- "Cristal", "Artificial", etc.
  is_indoor   boolean,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courts_club ON courts (club_id, is_active);

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courts_select_member"
  ON courts FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "courts_insert_admin"
  ON courts FOR INSERT WITH CHECK (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "courts_update_admin"
  ON courts FOR UPDATE USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `reservations`

A time block on a court.

```sql
CREATE TABLE reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  court_id    uuid NOT NULL REFERENCES courts(id),
  created_by  uuid NOT NULL REFERENCES profiles(id),
  date        date NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  status      text NOT NULL DEFAULT 'CONFIRMED'
              CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT end_after_start CHECK (end_time > start_time)
);

CREATE INDEX idx_reservations_club        ON reservations (club_id, date);
CREATE INDEX idx_reservations_court_date  ON reservations (court_id, date);

-- Note: enforce no-overlap via application logic or a trigger.
-- A GiST exclusion constraint requires btree_gist extension:
-- ALTER TABLE reservations ADD CONSTRAINT no_overlap
--   EXCLUDE USING gist (court_id WITH =, daterange(date, date, '[]') WITH &&,
--                       tsrange(date + start_time, date + end_time) WITH &&)
--   WHERE (status != 'CANCELLED');

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations_select_member"
  ON reservations FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "reservations_insert_admin"
  ON reservations FOR INSERT WITH CHECK (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "reservations_update_admin"
  ON reservations FOR UPDATE USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `reservation_players`

Players assigned to a reservation (up to 4 in padel).

> **Future consideration:** This table may eventually need a `participant_type` or `player_role` field to distinguish between registered club members and guests (e.g., a non-member playing as a guest). Do not add this field now. It is only needed if guest reservations become a product requirement.

```sql
CREATE TABLE reservation_players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id),
  UNIQUE (reservation_id, profile_id)
);

CREATE INDEX idx_reservation_players_res     ON reservation_players (reservation_id);
CREATE INDEX idx_reservation_players_profile ON reservation_players (profile_id);

ALTER TABLE reservation_players ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can read the reservation can read its players
-- Use RLS join via reservation's club_id
CREATE POLICY "reservation_players_select"
  ON reservation_players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_id AND auth.is_club_member(r.club_id)
    )
  );
```

---

### `seasons`

Organizes tournaments and rankings by time period. Avoids data accumulation without context.

```sql
CREATE TABLE seasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name        text NOT NULL,                     -- "Temporada 2026 – Semestre 1"
  starts_at   date NOT NULL,
  ends_at     date NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,    -- only one active per club
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_seasons_one_active
  ON seasons (club_id) WHERE (is_active = true);  -- partial unique index

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seasons_select_member"
  ON seasons FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "seasons_manage_admin"
  ON seasons FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `tournaments`

A competitive event within a club and season.

```sql
CREATE TABLE tournaments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  season_id             uuid REFERENCES seasons(id),
  name                  text NOT NULL,
  description           text,
  category              text NOT NULL,           -- "MASCULINO_A", "FEMENINO_B", "MIXTO", etc.
  format                text NOT NULL DEFAULT 'SINGLE_ELIMINATION'
                        CHECK (format IN ('ROUND_ROBIN', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'LEAGUE')),
  status                text NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'REGISTRATION_OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  max_participants      integer,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at             date,
  ends_at               date,
  created_by            uuid NOT NULL REFERENCES profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournaments_club    ON tournaments (club_id, status);
CREATE INDEX idx_tournaments_season  ON tournaments (season_id);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_select_member"
  ON tournaments FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "tournaments_manage_admin"
  ON tournaments FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `tournament_participants`

Individual player registration in a tournament.

> **Padel doubles model (MVP):** Padel is a doubles sport. For MVP, pairs are modeled using `profile_id` + `partner_id` on this table. This is intentionally simple. A dedicated `pairs` table is deferred until the tournament and ranking model requires persistent team history (e.g., a pair that plays across multiple tournaments with a shared record). Do not create a `pairs` table in the MVP.

Note: `partner_id` is optional — a player can register individually and have their partner assigned later by an admin.

```sql
CREATE TABLE tournament_participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id),  -- denormalized
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id),
  partner_id  uuid REFERENCES profiles(id),          -- doubles partner (optional)
  status      text NOT NULL DEFAULT 'REGISTERED'
              CHECK (status IN ('REGISTERED', 'CONFIRMED', 'WITHDRAWN', 'ELIMINATED')),
  seed        integer,                               -- seeding position, set by admin
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, profile_id)
);

CREATE INDEX idx_tp_tournament  ON tournament_participants (tournament_id);
CREATE INDEX idx_tp_profile     ON tournament_participants (profile_id);
CREATE INDEX idx_tp_club        ON tournament_participants (club_id);

ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_select_member"
  ON tournament_participants FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "tp_manage_admin"
  ON tournament_participants FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Players can register themselves
CREATE POLICY "tp_self_register"
  ON tournament_participants FOR INSERT
  WITH CHECK (profile_id = auth.uid() AND auth.is_club_member(club_id));
```

---

### `matches`

An individual match within a tournament.

```sql
CREATE TABLE matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubs(id),  -- denormalized
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round         integer NOT NULL,                    -- 1 = round 1, 2 = QF, etc.
  match_number  integer NOT NULL,                    -- position within round
  scheduled_at  timestamptz,
  court_id      uuid REFERENCES courts(id),
  status        text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BYE', 'CANCELLED')),
  next_match_id uuid REFERENCES matches(id),         -- bracket progression
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_matches_tournament ON matches (tournament_id, round);
CREATE INDEX idx_matches_club       ON matches (club_id);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matches_select_member"
  ON matches FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "matches_manage_admin"
  ON matches FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `match_players`

Links players to a match, grouped by team (1 or 2).

```sql
CREATE TABLE match_players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id     uuid NOT NULL,                     -- denormalized
  profile_id  uuid NOT NULL REFERENCES profiles(id),
  team        smallint NOT NULL CHECK (team IN (1, 2)),
  UNIQUE (match_id, profile_id)
);

CREATE INDEX idx_match_players_match   ON match_players (match_id);
CREATE INDEX idx_match_players_profile ON match_players (profile_id);

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_players_select"
  ON match_players FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "match_players_manage_admin"
  ON match_players FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `match_results`

One result per completed match. Triggers ranking recalculation.

```sql
CREATE TABLE match_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  club_id       uuid NOT NULL,                   -- denormalized
  winner_team   smallint NOT NULL CHECK (winner_team IN (1, 2)),
  score_team1   jsonb,                           -- e.g. [6, 7, 10] (sets + tiebreak)
  score_team2   jsonb,
  registered_by uuid NOT NULL REFERENCES profiles(id),
  registered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_results_club ON match_results (club_id);

ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_results_select_member"
  ON match_results FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "match_results_insert_admin"
  ON match_results FOR INSERT WITH CHECK (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Trigger: update rankings automatically on result insert
CREATE TRIGGER on_match_result_inserted
  AFTER INSERT ON match_results
  FOR EACH ROW EXECUTE FUNCTION update_ranking_on_result();
```

---

### `rankings`

A ranking definition (per club, per season, per category).

```sql
CREATE TABLE rankings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  season_id   uuid REFERENCES seasons(id),
  name        text NOT NULL,                     -- "Ranking General – 2026"
  category    text,                              -- NULL = all categories
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rankings_club ON rankings (club_id, is_active);

ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rankings_select_member"
  ON rankings FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "rankings_manage_admin"
  ON rankings FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### Ranking Configuration — Pre-Implementation Decision Required

> **Before implementing Sprint 5 (Rankings), the points formula must be decided and agreed upon with a real club owner.** The wrong formula erodes trust and is hard to change retroactively once data exists.

Key decision: **Are ranking formulas global (same for all clubs) or configurable per club?**

For MVP, a hardcoded formula is acceptable. If clubs need customization, the following table should be added **after validation, not before**:

```sql
-- Future table — do NOT create in MVP unless explicitly required
CREATE TABLE ranking_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  ranking_id            uuid REFERENCES rankings(id) ON DELETE CASCADE,
  win_points            integer NOT NULL DEFAULT 10,
  loss_points           integer NOT NULL DEFAULT 0,
  tournament_bonus_points integer NOT NULL DEFAULT 5,   -- bonus for reaching finals, etc.
  participation_points  integer NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

Do not add `ranking_rules` to the MVP schema. Start with constants, document the formula, and only extract to a table when a real club requests per-club customization.

---

### `ranking_entries`

Current standing of each player in a ranking. Computed automatically.

```sql
CREATE TABLE ranking_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id      uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  club_id         uuid NOT NULL,                 -- denormalized
  profile_id      uuid NOT NULL REFERENCES profiles(id),
  position        integer,
  points          integer NOT NULL DEFAULT 0,
  matches_played  integer NOT NULL DEFAULT 0,
  matches_won     integer NOT NULL DEFAULT 0,
  matches_lost    integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ranking_id, profile_id)
);

CREATE INDEX idx_ranking_entries_ranking  ON ranking_entries (ranking_id, position);
CREATE INDEX idx_ranking_entries_club     ON ranking_entries (club_id);
CREATE INDEX idx_ranking_entries_profile  ON ranking_entries (profile_id);

ALTER TABLE ranking_entries ENABLE ROW LEVEL SECURITY;

-- Public to all club members
CREATE POLICY "ranking_entries_select"
  ON ranking_entries FOR SELECT USING (auth.is_club_member(club_id));

-- Only the trigger function updates these (SECURITY DEFINER)
CREATE POLICY "ranking_entries_system_write"
  ON ranking_entries FOR ALL USING (false);     -- application never writes directly
```

---

### `clinics`

Training sessions organized by the club.

```sql
CREATE TABLE clinics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  instructor_name text,
  instructor_id   uuid REFERENCES profiles(id),
  court_id        uuid REFERENCES courts(id),
  capacity        integer NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'UPCOMING'
                  CHECK (status IN ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clinics_club   ON clinics (club_id, status);
CREATE INDEX idx_clinics_dates  ON clinics (starts_at);

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinics_select_member"
  ON clinics FOR SELECT USING (auth.is_club_member(club_id));

CREATE POLICY "clinics_manage_admin"
  ON clinics FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `clinic_registrations`

Player enrollment in a clinic.

```sql
CREATE TABLE clinic_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  club_id       uuid NOT NULL,                   -- denormalized
  profile_id    uuid NOT NULL REFERENCES profiles(id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, profile_id)
);

CREATE INDEX idx_clinic_registrations_clinic  ON clinic_registrations (clinic_id);
CREATE INDEX idx_clinic_registrations_profile ON clinic_registrations (profile_id);

ALTER TABLE clinic_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_reg_select"
  ON clinic_registrations FOR SELECT USING (auth.is_club_member(club_id));

-- Players can self-register
CREATE POLICY "clinic_reg_self_insert"
  ON clinic_registrations FOR INSERT
  WITH CHECK (profile_id = auth.uid() AND auth.is_club_member(club_id));

CREATE POLICY "clinic_reg_admin_manage"
  ON clinic_registrations FOR ALL
  USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

### `announcements`

Club-level communications for players.

```sql
CREATE TABLE announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title         text NOT NULL,
  content       text NOT NULL,
  is_published  boolean NOT NULL DEFAULT false,
  published_at  timestamptz,
  expires_at    timestamptz,
  created_by    uuid NOT NULL REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_club ON announcements (club_id, is_published, published_at);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select_published"
  ON announcements FOR SELECT
  USING (auth.is_club_member(club_id) AND is_published = true);

CREATE POLICY "announcements_select_admin"
  ON announcements FOR SELECT
  USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "announcements_manage_admin"
  ON announcements FOR ALL USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));
```

---

## Entity Relationship Summary

```
auth.users
    │ 1:1
    ▼
profiles ◄────────────────── club_members ──────────────────► clubs
                                  │                               │
                                  │ role: OWNER|ADMIN|PLAYER      │
                                  │                           ────┼────
                                  │                           │   │   │
                             invitation_links              courts seasons
                                                              │
                                                        reservations
                                                              │
                                                   reservation_players

clubs ──► tournaments ──► matches ──► match_players (profile)
               │              │
          tournament_      match_results ──► [TRIGGER] ──► ranking_entries
          participants
                                                  ▲
                                               rankings ◄── clubs

clubs ──► clinics ──► clinic_registrations (profile)

clubs ──► announcements
```

---

## Future Tables (Phase 2+)

| Table | Purpose |
|---|---|
| `open_matches` | Players posting matches seeking opponents |
| `match_requests` | Requests to join open matches |
| `memberships` | Paid club memberships with tiers |
| `membership_plans` | Plan definitions (monthly, annual, etc.) |
| `payments` | Payment records (Stripe/MercadoPago) |
| `notifications` | In-app notification queue |
| `push_tokens` | FCM/APNS tokens for mobile push |
| `player_connections` | Social graph (friends/contacts within platform) |
