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

The following are explicitly out of MVP scope — do not implement yet, even opportunistically: club ownership transfer, ranking, guest players, global "delete my Mi Pádel Club account" (see Club Membership Principles), and any membership/subscription-tier strategy.

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

A player's permanent statistics are: Partidos, Victorias, Derrotas, Win %, Reservas, Cancelaciones. Per Principle 2 (Do Not Depend On Administrative Discipline), these must be derived automatically from real reservation/match data, never manually maintained or manually recalculated.

---

## Club Membership Principles

A public club's join is instant: no `club_join_requests` row, no OWNER/ADMIN approval, membership created directly with role PLAYER. A private club's join always goes through the existing request+approval flow. Which one applies is decided by re-reading the club's real visibility on the server at the moment of the join action — never trusted from a client-supplied flag, which only ever drives button copy.

OWNER and ADMIN can deactivate a PLAYER's membership in their own club — never an OWNER, an ADMIN, or a member of another club. Deactivating never deletes anything and never touches `account_type`: it flips `club_members.is_active` to false and cleans up the player's future commitments rather than being blocked by them — every future pending/confirmed reservation the player created is cancelled (as the club's own operational cancellation, not the player's voluntary one, so the 2-hour window never applies), and their participation in any future reservation created by someone else is removed, leaving that reservation, its creator, and its other participants untouched. History is always preserved.

Leaving a club (the player's own voluntary equivalent of the above) only ends that one membership — it is never account deletion. The player keeps their account, keeps every other club's membership, and can join new clubs afterward. A global "delete my Mi Pádel Club account" flow is out of MVP scope.

Before a player leaves, the platform warns them that their own future reservations will be cancelled and that they will stop participating in others' future reservations. Only after the player confirms — reusing the exact same reservation-cleanup rule deactivation uses above (own reservations cancelled in full, participation in others' removed, nothing about a reservation already underway or in the past ever touched) — is the membership itself deactivated. Ownership of a reservation is never transferred to another participant; the MVP has no such mechanism.

Leaving marks the membership inactive (a voluntary departure), never deletes it. Rejoining afterward follows the normal join rules: instant for a public club, a new request for a private club. Historical stats are preserved across a departure. Once ranking exists (not yet implemented), leaving a club will mean losing that club's ranking points specifically.

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