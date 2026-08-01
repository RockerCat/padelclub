# PadelClub

## Project Overview

PadelClub is a multi-tenant SaaS platform for amateur sports clubs, initially focused on padel clubs.

The platform helps clubs manage operations, engage players and provide visibility to club owners.

PadelClub is the platform.

Each club maintains its own identity, branding, players, tournaments, rankings and reservations.

## Vision

Build the digital home of an amateur sports club.

The goal is NOT to build a complex ERP.

The goal is NOT to build a social network.

The goal is to replace fragmented workflows currently handled through WhatsApp, Excel and manual processes.

Build the digital home of an amateur sports club.

## Product Strategy

### Primary Customer

The club owner is the primary customer.

Club owners:

- Make adoption decisions
- Control budgets
- Can enforce platform usage
- Benefit from operational visibility

When there is uncertainty between owner value and player value:

**Prioritize owner value.**

### Club Growth Objective

PadelClub should help clubs:

- Increase court occupancy
- Increase player participation
- Improve tournament engagement
- Improve clinic participation
- Reduce operational workload

The platform is not only an administrative tool.

It is a club growth platform.

## Core Product Principles

### Principle 1: Eliminate Work

PadelClub should remove work.

Never create additional work.

Before building a feature ask:

- Does this reduce manual effort?
- Does this reduce WhatsApp dependency?
- Does this eliminate Excel usage?
- Does this improve visibility?

If not, reconsider the feature.

### Principle 2: Do Not Depend On Administrative Discipline

The platform must work even when administrators are busy.

Bad:

- Manual ranking updates
- Manual statistics maintenance
- Manual calculations

Good:

- Register result
- Ranking updates automatically
- Statistics update automatically

Automation is preferred whenever possible.

### Principle 3: Simplicity Over Features

Many club administrators are not highly technical.

Every workflow should feel approachable to someone currently using:

- WhatsApp
- Excel
- Paper notebooks

If a feature requires training, it is probably too complex.

### Principle 4: Mobile First

Assume most users access the platform from mobile devices.

All workflows should be designed mobile-first.

Desktop support is important but secondary.

### Principle 5: Real Adoption Over Feature Count

Success is measured by real club adoption.

Not by:

- Number of screens
- Number of features
- Technical complexity

A simple feature used daily is more valuable than an advanced feature nobody uses.

### Principle 6: Create Accountability

The platform should make club activity visible.

Owners should always know:

- Reservation activity
- Tournament activity
- Ranking freshness
- Administrator activity
- Player participation
- Court occupancy

Visibility drives adoption.

The platform should help owners understand what is happening inside their club without depending on verbal updates from administrators.

## Product Scope Prioritization

The current MVP focuses on operational workflows.

Highest priority:

1. Reservations
2. Courts
3. Players
4. Club administration
5. Operational analytics

Features such as:

- Tournaments
- Rankings
- Ladders
- Community
- Payments
- Mobile applications

should not be prioritized over operational workflows unless explicitly requested.

The following are explicitly out of MVP scope — do not implement yet, even opportunistically: club ownership transfer, guest players, global "delete my Mi Pádel Club account" (see Club Membership Principles), and any membership/subscription-tier strategy. Per-club category ranking (see Sport / Ranking Module Principles) and single-elimination tournaments per club (see Tournament Module Principles) were explicitly requested and are now implemented; global cross-club ranking, ladders, and any match/tournament result or point award outside the tournament module remain out of scope.

When there is uncertainty:

**Prioritize reservations and owner value.**

---

## Multi-Tenant Principles

PadelClub is a multi-tenant platform.

Every feature must respect club boundaries.

All data must be scoped to a club.

Users may belong to multiple clubs simultaneously.

Users may have different roles in different clubs.

Avoid assumptions that a user belongs to only one club.

Always evaluate new features from a multi-club perspective.

Club isolation is a core platform requirement.

---

## Role Philosophy

Account types — SUPERADMIN, OWNER, ADMIN, PLAYER — are global and permanent, never derived from or scoped to a club. A user's relationships with clubs (which clubs, which membership) are independent of their account type.

Signing up never assigns a type by itself — a fresh account has no type at all (`profiles.account_type IS NULL`) until it takes its first qualifying action: creating a club (→ OWNER), joining/requesting a club as a player (→ PLAYER), or accepting a valid ADMIN invitation (→ ADMIN). Once assigned, `account_type` is permanent — the database itself rejects any later change, including back to untyped. The PLAYER→ADMIN exception described under ADMIN below is implemented as exactly this same untyped state: only an account with `account_type IS NULL` and zero `club_members` history of any kind (active or inactive) may accept an ADMIN invitation.

SUPERADMIN is fully exclusive: it can never be OWNER, ADMIN, or PLAYER, and never holds a `club_members` row of any kind — active, inactive, or historical, in any club. It never participates operationally inside a club; it only operates the platform itself, from the global platform panel. `profiles.is_platform_admin` (the pre-existing flag identifying who this is) is kept for compatibility with existing code, but the database rejects any `club_members` row for a profile that is SUPERADMIN by either signal.

### OWNER

The owner is the primary customer.

Owners care about:

- Occupancy
- Visibility
- Revenue opportunities
- Administrative efficiency
- Club growth

When prioritizing functionality:

**Owner value takes precedence.**

OWNER is the only paying customer type. An OWNER can own one or several clubs, and can switch between them from within the app. An OWNER never becomes a PLAYER and never becomes an ADMIN. With a single club, sign-in goes straight there; with several, sign-in goes to the last club used.

### ADMIN

Administrators focus on daily operations.

Their primary workflows include:

- Reservation management
- Court management
- Player administration

Administrators are operators, not business owners.

Do not assume administrators need access to owner-level insights or configuration.

An ADMIN account only ever comes from an OWNER's invitation — there is no public self-registration path into this role. An ADMIN administers exactly one club and never changes role, with one exception: a PLAYER who has never belonged to any club can accept an ADMIN invitation and permanently become an ADMIN.

### PLAYER

Players are secondary users.

Players primarily care about:

- Finding available courts
- Making reservations
- Participating in club activities

Players do not need access to most operational information.

Player experiences should focus on action and convenience rather than administration.

A PLAYER can belong to multiple clubs simultaneously: joining a public club is instant, requesting access to a private club goes through request+approval (see Club Membership Principles).

---

## Club Sharing Principles

There are no invitations for players. The only mechanism is sharing the club's public link, which simply opens the public club page — it creates no record, has no expiration, no acceptance, no rejection, and no tracking. Do not build an invitation/acceptance flow around this link; it is nothing more than a URL.

Player invitations should not be confused with ADMIN invitations, which are a real, tracked, accept/reject flow (see Role Philosophy → ADMIN).

---

## Privacy Principles

Players do not need visibility into all club activity.

When designing player-facing experiences:

- Avoid exposing personal information unnecessarily.
- Avoid exposing reservation details that do not help the player take action.
- Avoid exposing administrative data.
- Prefer availability views over administrative views.
- Show only the information required to complete a workflow.

Reservation visibility should be evaluated carefully.

A player typically wants to know:

- Whether a court is available.
- Whether a reservation can be requested.

A player usually does not need to know:

- Who is playing.
- Internal reservation notes.
- Administrative activity.

---

## Operational UX Principles

PadelClub is operational software.

Operational users repeat the same actions frequently.

Favor:

- Fewer clicks
- Fewer page transitions
- Inline workflows
- Modal workflows
- Context preservation
- Fast access to frequent actions

Avoid:

- Placeholder screens
- Pages with a single action button
- Navigation that interrupts operational flow
- Unnecessary confirmation screens

Users should remain in context whenever possible.

The platform should feel efficient during daily repetitive usage.

---

## MVP Decision Framework

When evaluating new features, ask:

1. Does this help club owners operate their club?
2. Does this reduce manual work?
3. Does this reduce WhatsApp dependency?
4. Does this increase court occupancy?
5. Does this improve operational visibility?
6. Does this simplify an existing workflow?

If the answer is "no" to most of these questions, reconsider the feature.

Prefer solving real operational problems before adding new feature categories.

---

## Current Product Phase

PadelClub is currently in MVP validation mode.

The current objective is not feature expansion.

The current objective is:

- Validate operational workflows.
- Remove friction.
- Improve usability.
- Verify role permissions.
- Improve reservation management.
- Validate real-world club usage.

Before introducing major new modules, ensure the core reservation and club management experience is solid and operationally reliable.

## Club Identity Principles

A club is not only operational data.

Each club should feel like a real place with its own identity.

The Owner should immediately recognize:

- Club branding
- Club logo
- Club cover image
- Club visibility
- Club public profile

The dashboard should not feel like a generic administration panel.

The dashboard should feel like the digital home of the club.

Whenever possible:

- Reuse club identity elements across public and private experiences.
- Maintain visual consistency between the public club page and the owner dashboard.
- Avoid forcing owners to navigate deep configuration screens for common branding tasks.
- Prefer direct manipulation of visual assets (logo, cover image, branding) from the dashboard.

The club's own configured color is for identity/branding surfaces only — buttons, links, accents. Never use it to represent a reservation's status. Reservation state colors (confirmed, pending, and per-type tints such as class/block) are fixed and independent of any club's configured color, so they read identically across every club.

Operational workflows remain important, but club identity should always be visible.

---

## Club Archival Principles

During the MVP a club is never physically deleted — it is archived instead, via `clubs.archived_at` (`NULL` = active). Only the OWNER can archive their own club, server-side and atomically; ADMIN and SUPERADMIN have no capability here.

Archiving blocks every operation that would create a new commitment against the club — new/edited/approved reservations, new join requests, new ADMIN invitation claims — and removes the club from public discovery and its public profile. It never cancels or modifies anything that already exists: members, reservations (past or future), pricing, and branding are all left exactly as they were. Existing members keep read-only access to an archived club. Resolving something that already exists (cancelling a reservation, rejecting a pending request) is never blocked — only actions that would create something new are.

Reactivation is out of MVP scope — not yet implemented.

---

## Club Statistics Principles

Club-level operational statistics (`/[club]/admin/statistics`, OWNER/ADMIN only) are always computed live in PostgreSQL through a single SECURITY DEFINER RPC — never downloaded raw and aggregated in the browser, never persisted or cached. `type = 'block'` is excluded from every metric; `reservations.date`/`start_time` (never `created_at`) drive every date-based aggregation, always interpreted as America/Bogota. No monetary metric exists — `price_amount` is frequently null (unpriced admin bookings, requests with no matching tariff), so no honest revenue figure is possible with the current model. A club's `is_active`/`archived_at` never blocks reading its own historical statistics (see Club Archival Principles — read access to history is never affected by archival).

---

## Notifications & Live-Update Principles

There is one notification system: bell, unread badge, dropdown and `/notifications`.

Reuse it everywhere a user can see notifications, including the public club page (`/[slug]`) for authenticated visitors.

Never duplicate notification queries, Realtime subscriptions, or read/unread logic per surface.

Actions triggerable from a notification (e.g. approving a join request) must reuse the same server action already used elsewhere (e.g. the Jugadores screen) — never a second implementation of the same business rule.

A member should never be force-redirected away from a page they are actively viewing because of a background change (an admin action, a Realtime event). Prefer updating the current view in place; reserve redirects for fresh navigations.

A PLAYER who already belongs to a club is not redirected away from that club's public page (`/[slug]`) — only OWNER/ADMIN are sent to their operational area. Players choose when to continue into Reservations.

Whether a request (join request, reservation request) has been resolved is shared state, visible identically to every notified OWNER/ADMIN. Whether a specific notification has been read is per-user state. Never use one to represent the other — do not infer "resolved" from "read", and do not mark other recipients' notifications as read as a side effect of one recipient resolving the underlying request.

---

## Reservation Status Principles

A reservation's `status` communicates why it is not currently active: `pending` (awaiting OWNER/ADMIN review), `confirmed`, `cancelled` (a confirmed reservation later cancelled), or `rejected` (a pending request the club declined). `cancelled` and `rejected` are never interchangeable — they are different events, with different audiences and different notifications, even though both end a reservation.

A rejection always carries a reason, chosen from one shared, server-validated catalog (never a free-form reason trusted from the client alone, never a second copy of the catalog). The requesting player is always notified of a rejection and its reason, the same way every other reservation notification is delivered.

---

## Reservation Editing & Cancellation Principles

A reservation's court, date, start time, and duration can be edited — by its creator, or by any OWNER/ADMIN of the same club. Being a participant (added to `reservation_players`, never the creator) grants no edit or cancel permission of its own. During the MVP, editing never changes the creator, the club, the participant list, or the type — every new value is re-validated against exactly the same rules reservation creation already enforces (active court in the same club, operating hours, allowed duration, no conflicting reservation), and every player linked to the reservation is notified of the new schedule.

When a PLAYER edits a still-pending request, it stays pending. When a PLAYER edits an already-confirmed reservation and the schedule actually changes, it reverts to pending for fresh review — the same rule every new request already follows, since the MVP has no auto-approval policy. When OWNER/ADMIN edits, the reservation's status is never touched. A PLAYER-created reservation's price is always recalculated for its new schedule using the same pricing resolution rule as creation; OWNER/ADMIN-created reservations are never priced, unchanged.

During the MVP, a player can cancel or edit their own reservation up to 2 hours before its start time; this window is fixed and not configurable per club during the MVP (a future version will let each club configure it). OWNER and ADMIN can cancel or edit a reservation at any time, with no window restriction.

---

## Player Statistics Principles

A player's own statistics are always derived live from real reservation data (Principle 2 — never manually maintained, never a persisted/cached snapshot). Victorias/Derrotas/Win % remain unimplemented — there is no match-result tracking in the schema; do not approximate them.

A reservation counts as a user's own personal participation only when they appear in `reservation_players`, or when they are `reservations.created_by` **and** their own `profiles.account_type` is exactly `'PLAYER'`. An OWNER/ADMIN's `created_by` reflects administrative authorship — booking for a third party, a class, or the club itself — never personal participation, since the product has no flow that lets an OWNER/ADMIN add themselves to `reservation_players`. This is safe because `account_type` is a global, database-enforced invariant: once set, it matches every `club_members` role a profile holds, in every club, permanently (a trigger rejects any mismatch) — so an OWNER/ADMIN's personal summary being all zeros is expected and correct, never approximated into something else.

The global "Mi Perfil" page (`/profile`) is account-level, not club-scoped — it aggregates this participation across every club a user has ever belonged to, including clubs left, memberships deactivated, or since archived, because a user's own history always stays visible to them. No monetary, ranking, ELO, or attendance metric exists — "horas confirmadas" means a slot was reserved, never that it was actually played.

---

## Club Membership Principles

A public club's join is instant: no `club_join_requests` row, no OWNER/ADMIN approval, membership created directly with role PLAYER. A private club's join always goes through the existing request+approval flow. Which one applies is decided by re-reading the club's real visibility on the server at the moment of the join action — never trusted from a client-supplied flag, which only ever drives button copy.

OWNER and ADMIN can deactivate a PLAYER's membership in their own club — never an OWNER, an ADMIN, or a member of another club. Deactivating never deletes anything and never touches `account_type`: it flips `club_members.is_active` to false and cleans up the player's future commitments rather than being blocked by them — every future pending/confirmed reservation the player created is cancelled (as the club's own operational cancellation, not the player's voluntary one, so the 2-hour window never applies), and their participation in any future reservation created by someone else is removed, leaving that reservation, its creator, and its other participants untouched. History is always preserved.

Leaving a club (the player's own voluntary equivalent of the above) only ends that one membership — it is never account deletion. The player keeps their account, keeps every other club's membership, and can join new clubs afterward. A global "delete my Mi Pádel Club account" flow is out of MVP scope.

Before a player leaves, the platform warns them that their own future reservations will be cancelled and that they will stop participating in others' future reservations. Only after the player confirms — reusing the exact same reservation-cleanup rule deactivation uses above (own reservations cancelled in full, participation in others' removed, nothing about a reservation already underway or in the past ever touched) — is the membership itself deactivated. Ownership of a reservation is never transferred to another participant; the MVP has no such mechanism.

Leaving marks the membership inactive (a voluntary departure), never deletes it. Rejoining afterward follows the normal join rules: instant for a public club, a new request for a private club. Historical stats are preserved across a departure. Deactivation and leaving do not touch a member's sport state (see Sport / Ranking Module Principles) — points and category history are preserved untouched either way; the member simply stops appearing in the club's ranking view because it only ever lists active PLAYER members.

---

## Player Contact Principles

A valid WhatsApp phone is mandatory for every new PLAYER account — it is the platform's replacement for the WhatsApp-thread coordination clubs already do manually, so an OWNER/ADMIN must always be able to reach a player directly. Phone normalization and validation live in one shared utility (`src/lib/utils/phone.ts`); every entry point that can turn an account into an active PLAYER membership (signup during a join flow, `join_public_club`, `create_join_request`/`approve_join_request`, membership reactivation) re-validates through the same rule server-side — never trusted from client input alone, and never a second copy of the validation logic. Accounts created before this rule existed are grandfathered with a possibly-missing phone; the gap is closed opportunistically as they touch a gated flow again (e.g. reactivation) or edit their own number from Mi Perfil, never by a bulk forced migration during the MVP.

A player's WhatsApp number is only ever exposed to OWNER/ADMIN of a club the player belongs to, and only as a "Contactar por WhatsApp" action (a `wa.me` deep link), never displayed as raw text — consistent with the Privacy Principles above.

## Profile Photo Principles

A user's profile photo is personal-account-level, not club-scoped, stored in the `profile-avatars` Storage bucket under a folder keyed by the owning `auth.uid()`, with RLS restricting writes to that same folder. It is edited only from the global "Mi Perfil" page and immediately reflected everywhere that profile's avatar is shown.

Sporting identity (a PLAYER's photo plus their per-club category and Top-3 ranking crown) is always rendered through the shared `PlayerSportAvatar`/`RankMedalCrown` components (`src/components/players/`), reused verbatim across Ranking, the Jugadores admin view, and the member detail modal. Never re-implement this presentation per screen. This applies only to PLAYER identity — a club's own logo and an OWNER/ADMIN's avatar are separate concerns and never route through these components.

---

## Sport / Ranking Module Principles

Fase 1 of the sport module adds a per-club category ranking — a data foundation (`sport_categories`, `club_ranking_cycles`, `club_member_sport_state`, plus two immutable history tables) and a ranking view shared by every surface that can read it: OWNER/ADMIN at `/[club]/ranking` (with the same point-adjustment/category-change actions also available inline here, never only from Jugadores), PLAYER there too (read-only), and — for a `visibility='public'`, non-archived club — any visitor, authenticated or not, at `/clubs/[slug]/ranking` (a private club still requires an active membership; a single `readOnly` prop is what actually removes the mutation UI on that route, never a second component). It is not tournaments, ladders, or automatic match-result scoring.

`club_members.id` (never `profiles.id`) is the sport identity anchor. A member's category is never stored directly — it is always derived by joining through the club's currently active ranking cycle (one active cycle per club+category). Points move only through an immutable, append-only ledger (`club_player_point_movements`); a category change always writes exactly one additional technical movement that closes the old cycle's balance at its true final total. Points floor at zero, and an adjustment whose effective delta would be zero is rejected outright, never silently absorbed.

The legacy `club_members.category` free-text field (the pre-Fase-1 "Principiante"/skill-level label) is retired from every UI surface — the ranking-cycle category above is now the only category a player is ever shown. The column itself is left in place, unread by the UI, never resurrected as a second source of truth.

Provisioning a member's sport state is automatic (a trigger on `club_members`, for every active PLAYER), never a manual admin step, consistent with Principle 2. What remains manual in Fase 1 is the actual awarding of points and category changes (`adjust_club_player_points`, `change_club_player_category`, OWNER/ADMIN only, from Jugadores) — there is no match/tournament result flow yet to drive this automatically; that is a future phase, not yet designed.

Every sport RPC derives authorization from an explicit, direct query against `club_members` for an ACTIVE membership of the caller in that specific club — never solely from a role-returning helper whose result can be `NULL`, and never `NOT IN` (or any other comparison that silently passes on `NULL`) over a value that can be `NULL`. A caller with no active membership is always rejected explicitly (`42501`); there is never a fall-through to an unguarded read or write. This is a hard-won rule — a real authorization bypass of exactly this shape reached production once and was fixed (see PROJECT_STATUS.md).

`get_club_category_ranking`/`get_club_category_ranking_view` are the one deliberate exception to `authenticated`-only: both also grant `EXECUTE` to `anon`, allowing an unauthenticated or non-member caller precisely when the target club is `visibility='public'` and not archived — resolved inside the RPC itself against the real `clubs` row, never trusted from the client. An active member is always allowed regardless of visibility or archival (an archived club never blocks its own members' read access — see Club Archival Principles). Every other sport RPC (adjustments, category changes, `get_club_member_sport_state`) remains `authenticated`-only, unchanged.

Ordinary `type='match'` reservations may count toward "partidos jugados" once confirmed and finished, but they never have an official result, winner, wins, losses, points, or ranking impact. Only the tournament module can affect a player's ranking points, and only through `finalize_tournament` applying `tournament_entries.points` to the same `club_player_point_movements` ledger — never `reservations`, never any other write path. See Tournament Module Principles. A brief, real precedent for why this is stated explicitly: a first attempt (`20260831000001`/`20260831000002`) wired official match results directly onto `reservations`, was applied, and had to be withdrawn (`20260901000001`) once this rule was confirmed — never repeat that coupling.

---

## Tournament Module Principles

A tournament is scoped to one club and is either single-category or combined: `tournaments.category` is always the only category, or the superior one when combined; `tournaments.secondary_category` is `NULL` for a single-category tournament, or the inferior category when combined. Superiority is always enforced by comparing the real `sport_categories.sort_order` of the two codes — never a string comparison, never the digit inside the code, never a numeric sum, and never a parsed commercial name (a combined category may be marketed as "Suma 11" or similar, but that label is never the technical rule).

An entry (`tournament_entries`) represents one registered pair, always exactly two `tournament_entry_members`. A PLAYER can only register a pair that includes themselves, and it is always created `pending` (awaiting OWNER/ADMIN confirmation). OWNER/ADMIN can register any valid pair for any two eligible members, always created `confirmed` directly — the same pending/confirmed split already used by player-created vs. admin-created reservations. Capacity is `pending + confirmed` against `max_pairs`; a `withdrawn` entry frees its slot and is never deleted, only marked. Every registration is validated server-side for category composition, individually per player, never by a global count: a single-category tournament requires both players' real current category (via their `club_member_sport_state`) to equal it exactly; a combined tournament requires both players to belong to `{superior, inferior}` with at most one of the two at the superior category (superior+inferior, inferior+superior, and inferior+inferior are all valid; superior+superior is not). `tournament_entries.category`/`secondary_category` freeze the tournament's modality at the moment the entry is created and are never recalculated afterward, even if the tournament's own configuration changes later.

Mi Pádel Club does not administer the internal sporting competition of a tournament — no bracket, no matches, no rounds, no courts, no scores. It administers the tournament only as a club event: registration, pairs, a points-based classification and its application to the club ranking. This is a deliberate, hard-won scope decision (a full bracket/match/scheduling/award architecture was built, applied, and then deliberately deleted and replaced — `20260922000001`/`20260922000002` — once it was confirmed to be more complexity than the product needs; never rebuild it opportunistically). OWNER/ADMIN sets each confirmed entry's result directly as points (`set_tournament_entry_points`, OWNER/ADMIN-only) — there is no automatic scoring, no seeding, and no draw. Classification is never persisted: it is always computed live, client- and server-side alike, through the single shared `computeTournamentClassification(entries)` (`src/lib/tournamentEntries.ts`), which sorts confirmed entries by points desc (tiebreak by `created_at` asc) and assigns `position` with jump-on-tie semantics — the one source of truth for every ranking/podium/champion view in the module, never reimplemented or recalculated by index. Genuine N-way ties are real and expected at any position, including 1st — the UI always surfaces them honestly (multiple duplas sharing a podium block) and never collapses or invents a single winner or a fabricated "tercer lugar" where the real data has a tie.

`finalize_tournament(p_tournament_id)` is the single idempotent RPC that both applies each confirmed entry's points to the club's ranking ledger (`club_player_point_movements`, the same ledger described in Sport / Ranking Module Principles) and flips `tournaments.status` to `completed`, atomically — there is no separate "award" step and no separate completion step. It returns whether the tournament was already finalized, so a re-call is always safe and never double-applies points.

A tournament's cover image (`tournaments.cover_image_url`) can be set or replaced by OWNER/ADMIN in any tournament status, including `completed` — through a dedicated RPC (`update_tournament_cover_image`) deliberately without the status gate that `update_tournament` otherwise enforces on every other field, since branding a finished tournament (e.g. before generating its closing news) is a normal, expected action.

Once a tournament is `completed`, OWNER/ADMIN get an assisted "Generar noticia" action from the same detail page: it prefills the existing Noticias creation flow with a draft built purely from the tournament's real classification (`buildTournamentNewsDraft`, champions/runners-up/third-place taken from `computeTournamentClassification`, never invented) — publishing still goes through the exact same editorial flow, never automatic, and never a second Noticias implementation. The resulting `club_news` row always carries `tournament_id` as a real, tracked association (never guessed from title/content/date), enforced to at most one published news per tournament by a partial unique index — once one exists, the action becomes "Ver noticia" instead. This lateral control is OWNER/ADMIN-only; PLAYER and public visitors never see it, but the published news itself remains fully visible to everyone under the normal Noticias module rules regardless of its tournament origin.

Any `SECURITY DEFINER` function that returns a full row via `RETURN QUERY SELECT (row).*` must keep its `RETURNS TABLE` column list in exact sync with the real table shape — a wildcard row expansion has no static check against its function's declared return shape, so this must be verified by hand every time a column is added to `tournaments` or `tournament_entries`. This is a hard-won, previously-hit rule (adding `tournaments.secondary_category` broke several existing functions this way until a dedicated fix migration caught it).

A related pitfall, same root cause: when a function's `RETURNS TABLE` declares an output column named `id` (or any other name a table it writes to also has), a bare `RETURNING id` inside that function's own `INSERT` becomes ambiguous between the output column and the real table column — Postgres only catches this at runtime (`42702`), never statically. Any such statement must alias the target table explicitly (`INSERT INTO tbl AS t (...) ... RETURNING t.id`).

---

## Player Dashboard Principles

The PLAYER's canonical entry point to a club is `/[club]/dashboard` — the exact same route OWNER/ADMIN already use, never a second URL. The page branches by role: OWNER/ADMIN keep their existing operational dashboard completely untouched; PLAYER gets a personal sport dashboard (header, upcoming activity, points/ranking evolution, sport summary, own tournaments, dynamically-computed achievements, personal activity timeline) that is never a reduced copy of the operational one. `/[club]/home` still exists (club branding/news/reservations activity) but is no longer the PLAYER's entry point.

`club_member_sport_state`, `club_player_point_movements`, and `club_player_category_changes` are RLS-closed to every client role (see Sport / Ranking Module Principles) — `get_my_club_sport_profile(p_club_id)` is the one new RPC this dashboard needed to read them for the caller's own membership. It is self-only by construction: it derives `club_member_id` from `auth.uid()` + `p_club_id` internally and never accepts a club_member_id parameter, so it carries no per-target authorization surface to get wrong. It reuses `get_club_category_ranking` itself for the caller's current points/position (never a second formula, so the header always matches what `/ranking` would show), and reconstructs a points/ranking-position evolution series purely from real ledger rows (the active cycle's start, every one of the caller's own point movements, and "now") — never a stored history table, never a synthetic/interpolated data point. Everything else this dashboard shows (próxima actividad, mis torneos, resumen, actividad reciente) is resolved in `src/lib/playerDashboard.ts` by reusing existing reads and lib functions (`getPlayerReservations`, `getTournamentEntriesWithMembers`/`computeTournamentClassification`/`isOwnEntry`, direct `reservations`/`tournament_entries`/`tournament_entry_members` reads under their existing RLS) — no reservation, ranking, or tournament business rule was changed to build this.

A player can hold more than one `tournament_entries` row for the same tournament over time (e.g. withdrew and re-registered) — any event derived "per tournament" (such as "torneo finalizado" in the activity timeline) must dedupe by `tournament_id` before rendering, never emit one per entry, or React sees duplicate list keys.

---

## Sports Data Export Principles

OWNER/ADMIN can generate a shareable PNG image (1080×1350, via the shared visual shell `ShareCardShell`) for the Ranking Top 10 of the currently selected category. There is no equivalent PNG export for tournaments — the podium/results export that once existed alongside the old bracket architecture was removed along with it and has not been rebuilt; do not assume it exists. Generation is entirely client-side and on demand only — never at page load, never for a hidden/permanently-mounted card, never uploaded to Storage, never via service role, never published automatically to any external platform; the user always explicitly shares (Web Share API with the image file, never a link-only share) or downloads. Every avatar/logo is resolved to a data URL by the caller before the card ever mounts, each with its own timeout — a failed or slow image always falls back to initials, never blocks the rest of the export.

`html-to-image` (the only export library in the project) must always be called with `skipFonts: true`: its automatic web-font embedding scans every stylesheet in the whole document (never just the captured node) and has no timeout on its own internal `fetch()` calls, which previously caused generation to hang indefinitely with no error ever shown — a confirmed, hard-won gotcha, not a style preference. `ShareCardModal` additionally wraps the whole capture in a global timeout guarded by a generation token, so a stale/late result (from a timed-out attempt, or from a superseded retry) never overwrites a newer one.

---

## Shared View & Data Patterns

When two roles (e.g. PLAYER and OWNER/ADMIN) need the same underlying computation — court availability, a player's own reservations, the signed-in user's display identity — resolve it through one shared module both surfaces call. Never let admin and player views drift into two slightly different versions of the same rule.

When a secondary view is added alongside an existing primary one for the same data (e.g. an alternate calendar layout), prefer keeping both mounted and toggling visibility via CSS rather than conditionally rendering/unmounting — this lets local component state (filters, selections) survive switching between them for free, with no extra persistence mechanism.

Prefer CSS-based truncation (`truncate` on a `min-w-0` flex child) over manually cutting strings — it degrades correctly at any width and never mid-word-truncates content a screen reader still receives in full.

Any operation that turns a court/date/time slot from available to occupied — creating a reservation, editing one, or approving a pending request into confirmed — must validate availability and write the result inside one atomic, lock-protected operation, never a plain read-then-write split across separate calls. Every such operation shares the exact same locking/conflict-check mechanism, so none of them can ever double-book the same slot against each other.

---

## Reservation Pricing Principles

A club's reservation price is always a fixed amount configured explicitly for each tariff rule and each duration the club offers — never a rate multiplied by duration. A rule decides which tariff bucket applies (club, court, days, hours); the amount for a given duration is configured separately and explicitly for that bucket.

The reservation's start time alone determines which tariff rule applies. A reservation is never split across two tariff rules even if it extends past the rule's end time.

Price is always resolved server-side, through one shared resolution function, at the moment a reservation is requested. No caller may pass a price, rate, or currency into a mutation and have it trusted.

A missing price for the requested duration is a normal, explicit outcome, not an error to fall back from — it blocks the reservation request until an OWNER configures that duration's price.

---

## Documentation Workflow

This repository keeps two living documents:

- **CLAUDE.md** — the project's permanent context: stack, conventions, development rules, important structure, permissions, core modules, business flows, architecture decisions, standards. It should let a brand-new chat understand immediately how to work on this project.
- **PROJECT_STATUS.md** — the project's current state: completed features, new capabilities, relevant decisions, implemented modules, pending work, immediate roadmap. It is a status snapshot, not a commit history.

Update either file **only** when:

1. The user explicitly asks for it, or
2. An important feature or project milestone has just been completed.

Do **not** update them for small fixes, minor UI changes, or one-off corrections — CLAUDE.md only changes when something affects how the project is built (stack, conventions, rules, architecture); PROJECT_STATUS.md only changes when a real feature milestone lands.

When a completed feature does warrant a documentation update, follow this order:

1. Implement the feature first.
2. Update CLAUDE.md if the change affects architecture/conventions/rules.
3. Update PROJECT_STATUS.md to reflect the new state.
4. List both files among the modified files in the response.

If the change doesn't warrant a documentation update, leave both files untouched.