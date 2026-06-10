# PadelClub — Development Roadmap

> MVP focus: replace WhatsApp + Excel + manual processes for one real club.
> Each sprint is ~2 weeks unless noted. Sprints are sequential.
> Last updated: 2026-06-10

---

## Development Philosophy

PadelClub will **not** be built feature-complete before validating with real clubs.

The goal is to reach a working reservation management system as fast as possible, validate it with at least one real club, and only continue building if that validation passes.

Tournaments, rankings, and clinics are valuable — but only if the foundational experience (reservations, courts, players) is solid and adopted.

---

## Success Definition (MVP)

A real club can replace:
- WhatsApp reservation coordination → PadelClub reservations
- Excel ranking management → PadelClub rankings
- Manual tournament tracking → PadelClub tournaments

with PadelClub for at least **30 consecutive days**.

---

## Sprint Overview

### Phase 1 — Foundation (Build to Validate)

| Sprint | Focus | Duration |
|---|---|---|
| 0 | Infrastructure & foundations | 1 week |
| 1 | Auth + Multi-tenant + Clubs + Branding | 2 weeks |
| 2 | Courts & Players | 1 week |
| 3 | Reservations | 2 weeks |

### ⛔ Validation Gate — after Sprint 3

See [Validation Gate](#validation-gate-after-sprint-3) section below. No feature development until this passes.

### Phase 2 — Growth (Build after Validation)

| Sprint | Focus | Duration |
|---|---|---|
| 4 | Tournaments | 3 weeks |
| 5 | Automatic Rankings | 2 weeks |
| 6 | Clinics | 1 week |
| 7 | Player Portal | 2 weeks |

**Estimated to Validation Gate:** ~6 weeks.
**Estimated full MVP (if validation passes):** ~14 weeks from Sprint 0.

---

## Sprint 0 — Infrastructure & Foundations

**Objective:** The project compiles, deploys, and has everything needed for feature development to begin without friction. No business logic.

### Deliverables

- [ ] Supabase project created, env vars in `.env.local` and Vercel.
- [ ] `src/lib/supabase/client.ts` refactored to `createBrowserClient` (`@supabase/ssr`).
- [ ] `src/lib/supabase/server.ts` created with `createServerClient`.
- [ ] `src/middleware.ts` created (session refresh only, no DB queries).
- [ ] `src/lib/utils/cn.ts` — `clsx` + `tailwind-merge` utility.
- [ ] `src/types/database.ts` — Supabase CLI types scaffolded (empty, will fill as schema grows).
- [ ] `/components/ui/` — base primitives: `Button`, `Card`, `Input`, `Badge`, `Spinner`.
- [ ] Root layout: `lang="es"` corrected.
- [ ] Vercel project linked, preview deploys working on PR.
- [ ] ESLint config validated (existing `eslint.config.mjs`).
- [ ] GitHub branch protection: PR required, build must pass.

### Dependencies
None — this sprint has no predecessors.

### Risks
- `@supabase/ssr` ^0.12.0 API may differ slightly from docs. Read package README before implementing.
- Tailwind 4 `@theme` tokens must remain in `globals.css` — do not introduce a separate design token file.

---

## Sprint 1 — Auth + Multi-Tenant Core + Branding

**Objective:** A user can sign up, create a club, configure its branding, and land inside their authenticated club area. The tenancy boundary is enforced. All core tables are in place.

> This sprint merges what was previously two separate sprints (multi-tenant core and branding) because branding configuration is part of the initial club setup experience. Splitting them would require shipping a club without any visual identity.

### Deliverables

**Auth & Tenant core:**
- [ ] **Database:** `clubs`, `profiles`, `club_members`, `invitation_links` tables created with RLS.
- [ ] **DB:** `auth.club_role()` and `auth.is_club_member()` helper functions.
- [ ] **DB:** `handle_new_user()` trigger (auto-creates `profiles` row on signup).
- [ ] **Supabase types** regenerated: `npx supabase gen types typescript`.
- [ ] **Route:** `/auth/login` — email/password login form.
- [ ] **Route:** `/auth/signup` — signup with full name.
- [ ] **Route:** `/auth/callback/route.ts` — Supabase OAuth code exchange.
- [ ] **Route:** `/onboarding` — post-signup flow: enter club name + slug → becomes OWNER.
- [ ] **Layout:** `(app)/layout.tsx` — auth guard.
- [ ] **Layout:** `(app)/[club]/layout.tsx` — club context resolution + membership check.
- [ ] **Middleware:** session cookie refresh validated end-to-end.
- [ ] **Invite flow:** `/invite/[token]` route — resolves token, creates `club_members` row, redirects to login/signup.

**Branding & Settings (basic):**
- [ ] **Route:** `/[club]/admin/settings` — edit: name, description, logo, primary color, secondary color, WhatsApp, Facebook, Instagram, YouTube.
- [ ] **Storage:** Supabase Storage bucket `club-logos` (public, 1MB limit, image types only).
- [ ] **Logo upload:** client-side preview + upload to Supabase Storage + save URL to `clubs.logo_url`.
- [ ] **Branding application:** `[club]/layout.tsx` injects `--color-club-primary` and `--color-club-secondary` as CSS custom properties.
- [ ] **Club header:** `<ClubHeader />` component — displays club logo, name, applied to all `[club]/*` pages.
- [ ] **Admin guard:** `admin/layout.tsx` — redirect PLAYERs away.
- [ ] **Route:** `/[club]` — placeholder home page (shows club name + user role).

### Dependencies
Sprint 0 complete.

### Risks
- **Slug conflicts:** enforce URL-safe slug format at DB level (`CHECK (slug ~ '^[a-z0-9-]+$')`).
- **Onboarding UX:** keep it to 2–3 fields maximum. Branding customization belongs in Settings, not onboarding.
- **Session expiry:** the middleware must call `supabase.auth.getUser()` (not `getSession()`) to ensure tokens are refreshed. This is a known `@supabase/ssr` requirement.
- **Branding preview:** CSS variable update should be optimistic (visible before save) on the settings page.

---

## Sprint 2 — Courts & Players

**Objective:** Admins can manage the physical courts and the player roster. These are the foundational entities required before reservations.

### Deliverables

**Courts:**
- [ ] **DB:** `courts` table with RLS.
- [ ] **Route:** `/[club]/admin/courts` — list, create, deactivate courts.
- [ ] **Route:** `/[club]/admin/courts/[id]` — edit court name, description, surface, active status.
- [ ] **Sort:** drag-to-reorder courts by `sort_order` (affects calendar display order in Sprint 3).

**Players (club members):**
- [ ] **Route:** `/[club]/admin/players` — list all members (filter by role, search by name).
- [ ] **Route:** `/[club]/admin/players/[id]` — view player: profile info + activity summary.
- [ ] **Invite:** generate invitation link (`invitation_links` row) — copy/share link.
- [ ] **Deactivate player:** set `club_members.is_active = false`.

> **Note:** There is no separate `players` table. A player is a `profiles` row associated to a club via `club_members` with `role = 'PLAYER'`. The admin players screen queries `club_members JOIN profiles`.

### Dependencies
Sprint 1 complete (need `clubs` table, auth, admin panel layout, branding context).

### Risks
- Player search with >200 members needs server-side pagination. Implement from the start using Supabase `.range()`.
- Courts must exist before reservations. Do not skip this sprint.

---

## Sprint 3 — Reservations

**Objective:** Admins can create and manage court reservations. The daily reservation calendar replaces WhatsApp coordination.

### Deliverables

- [ ] **DB:** `reservations` + `reservation_players` tables with RLS.
- [ ] **Supabase types** regenerated.
- [ ] **Route:** `/[club]/admin/reservations` — calendar view (week view default, day view toggle).
  - Display all courts as columns, time slots as rows.
  - Click empty slot → create reservation modal.
  - Click existing reservation → view/edit/cancel.
- [ ] **Create reservation:** select court, date, start/end time, add players (search from members), optional notes.
- [ ] **Cancel reservation:** soft-delete (status = 'CANCELLED').
- [ ] **Overlap prevention:** validate on server action that no CONFIRMED reservation exists for the same court + time range.
- [ ] **Player view:** `/[club]/reservations` — read-only calendar showing today and upcoming week. Players see which courts are booked and who is playing.
- [ ] **Owner/Admin home dashboard widget:** "Reservas esta semana" count.

### Dependencies
Sprint 2 (courts must exist; player list needed for adding players to reservations).

### Risks
- **Calendar UI complexity:** do not build a full calendar library. Week view with CSS Grid is sufficient. Avoid dependencies (react-big-calendar, etc.).
- **Time zones:** store all times as `time` (no tz) + `date`. Display in local browser time. Clubs are single-timezone. Document this limitation.
- **Overlap detection:** use a Server Action for validation — never trust client-side checks alone.

---

## Validation Gate — After Sprint 3

> **Do not continue to Sprint 4 until this validation passes.**

After Sprint 3 is deployed, the product must be used by at least one real club under real conditions. The purpose is to confirm that the foundational experience (courts + reservations) is actually replacing WhatsApp before investing in tournaments, rankings, and clinics.

### Success Criteria

All of the following must be true before continuing:

- [ ] At least one real club has created its courts in PadelClub.
- [ ] An admin can create, edit, and cancel reservations without external help.
- [ ] The weekly calendar is understandable without any training or documentation.
- [ ] The club has visibly reduced WhatsApp coordination for court reservations.
- [ ] The club owner or admin has provided direct feedback after at least one week of real usage.
- [ ] The product has been used for **at least 7 consecutive days**.

### If Validation Fails

Do **not** continue to tournaments or rankings. Instead:

1. Identify the specific friction points from club feedback.
2. Fix the reservation flow until the success criteria are met.
3. Re-validate before proceeding.

Building more features on top of a flow that real users don't adopt is wasted work.

### If Validation Passes

Continue with Phase 2 — Growth, starting from Sprint 4 (Tournaments).

---

## Sprint 4 — Tournaments

> **Post-validation sprint. Do not start until the Validation Gate passes.**

**Objective:** Admins can create and manage a complete tournament lifecycle: registration → bracket → results. This is the most complex sprint.

### Deliverables

- [ ] **DB:** `seasons`, `tournaments`, `tournament_participants`, `matches`, `match_players`, `match_results` tables with RLS.
- [ ] **Supabase types** regenerated.
- [ ] **Route:** `/[club]/admin/tournaments` — list all tournaments with status badges.
- [ ] **Route:** `/[club]/admin/tournaments/new` — create tournament (name, category, format, dates, max participants).
- [ ] **Route:** `/[club]/admin/tournaments/[id]` — overview (stats, status, actions).
- [ ] **Route:** `/[club]/admin/tournaments/[id]/participants` — add/remove participants, assign pairs (partner_id), seed players.
- [ ] **Route:** `/[club]/admin/tournaments/[id]/bracket` — visual bracket. Generate bracket button (Server Action). Display current round status.
- [ ] **Bracket generation:** Server Action creates `matches` + `match_players` rows from seeding and format.
  - MVP format: **single elimination only**. Round Robin is deferred.
- [ ] **Route:** `/[club]/admin/tournaments/[id]/results` — register results. Select winner, optionally enter set scores.
- [ ] **Player view:** `/[club]/tournaments` — list tournaments (upcoming, active, completed).
- [ ] **Player view:** `/[club]/tournaments/[id]` — bracket view (read-only), participant list.
- [ ] **Player self-registration:** players can register in tournaments with status `REGISTRATION_OPEN`.

### Dependencies
Sprint 3 complete + Validation Gate passed.

### Risks
- **Bracket generation logic** is the riskiest part of this sprint. Isolate in `src/lib/utils/bracket.ts`. Cover with unit tests before wiring to UI.
- **Pair model:** padel is doubles. `partner_id` in `tournament_participants` defines the pair. Bracket draws pair vs pair, not individual vs individual.
- **Match result must be atomic:** when a result is inserted, the next-round match player slots must be populated. Use a DB transaction or a carefully ordered Server Action.
- **Do not build all tournament formats.** Single elimination only.

---

## Sprint 5 — Automatic Rankings

> **Post-validation sprint. Do not start until the Validation Gate passes.**

**Objective:** Rankings update automatically when a match result is registered. No manual ranking management.

> **Before implementing:** define the points formula and confirm with the club owner. The formula must be agreed upon before Sprint 5 begins. See DATABASE_SCHEMA.md section on `ranking_rules` for the recommended configuration approach.

### Deliverables

- [ ] **DB:** `rankings` + `ranking_entries` tables with RLS.
- [ ] **DB Trigger:** `on_match_result_inserted` → `update_ranking_on_result()` function.
  - Recalculates points for all participants in the match's tournament.
  - Updates `ranking_entries.points`, `matches_played`, `matches_won`, `matches_lost`.
  - Recomputes `position` ordering across all entries.
- [ ] **Points formula:** documented and agreed with club owner before coding begins.
- [ ] **Route:** `/[club]/rankings` — ranking table: position, player, points, matches played/won/lost. Filterable by category.
- [ ] **Route:** `/[club]/admin/rankings` — list rankings, create new ranking, set active ranking per season.
- [ ] **Owner dashboard widget:** ranking freshness (last updated timestamp).
- [ ] **Player view:** highlight player's own position in the ranking table.

### Dependencies
Sprint 4 complete (match results must exist to compute rankings).

### Risks
- **Wrong formula = lost trust.** Get explicit sign-off from a club owner before writing any trigger code.
- **Performance:** full recomputation on every result insert is acceptable for MVP with <200 players. Trigger runs `SECURITY DEFINER` to bypass RLS (rankings writes are system-only).
- **Multiple rankings:** a club may want ranking by category (Masculino A, Femenino, etc.). The `rankings` table supports this. Trigger must correctly identify which ranking to update based on tournament category.

---

## Sprint 6 — Clinics

> **Post-validation sprint. Do not start until the Validation Gate passes.**

**Objective:** Admins can create training clinics. Players can view and register.

### Deliverables

- [ ] **DB:** `clinics` + `clinic_registrations` tables with RLS.
- [ ] **Supabase types** regenerated.
- [ ] **Route:** `/[club]/admin/clinics` — list all clinics.
- [ ] **Route:** `/[club]/admin/clinics/[id]` — create/edit: name, instructor, court, capacity, schedule, description.
- [ ] **Capacity enforcement:** prevent registration when count >= capacity (Server Action, not client check).
- [ ] **Player view:** `/[club]/clinics` — upcoming clinics with registration status.
- [ ] **Player view:** `/[club]/clinics/[id]` — clinic detail + register/unregister button.
- [ ] **Admin:** view participant list per clinic.

### Dependencies
Sprint 2 complete (courts, players). Can be built in parallel with Sprint 5 if Sprint 4 is done.

### Risks
- **Capacity race condition:** two players register simultaneously and both see capacity available. Mitigate with a DB-level trigger:
  ```sql
  CREATE OR REPLACE FUNCTION check_clinic_capacity()
  RETURNS TRIGGER AS $$
  BEGIN
    IF (SELECT COUNT(*) FROM clinic_registrations WHERE clinic_id = NEW.clinic_id)
       >= (SELECT capacity FROM clinics WHERE id = NEW.clinic_id) THEN
      RAISE EXCEPTION 'Clinic is full';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```

---

## Sprint 7 — Player Portal

> **Post-validation sprint. Do not start until the Validation Gate passes.**

**Objective:** The player-facing experience is polished and mobile-first. Players have a reason to open PadelClub every week.

### Deliverables

- [ ] **Route:** `/[club]` (home) — personalized activity feed:
  - My upcoming reservations (next 7 days)
  - My ranking position (active ranking)
  - Active tournaments I'm participating in
  - Upcoming clinics I'm registered for
  - Recent club announcements
- [ ] **DB:** `announcements` table with RLS.
- [ ] **Route:** `/[club]/profile` — player's own profile:
  - Personal info (name, avatar)
  - My match history (last 10 matches)
  - My stats: matches played, win rate, tournaments entered
  - Current ranking positions across all active rankings
- [ ] **Avatar upload:** player can upload profile photo (Supabase Storage bucket `avatars`).
- [ ] **Mobile nav:** bottom tab bar on mobile for: Home, Reservations, Rankings, Tournaments.
- [ ] **Loading states:** `loading.tsx` for all player-facing routes (skeleton UIs).
- [ ] **Error handling:** `error.tsx` for all routes with graceful error messages.
- [ ] **Owner dashboard:** complete implementation with all metrics widgets.

### Dependencies
All previous sprints (full feature set must exist for the portal to be meaningful).

### Risks
- **Activity feed performance:** home page aggregates data from 5+ tables. Use parallel data fetching with `Promise.all()` in Server Component. Add `loading.tsx` with skeleton.
- **Mobile nav:** `AppNav.tsx` needs responsive variants — sidebar on desktop, bottom tab bar on mobile.
- **This is a quality sprint** — no new features, just polish. Resist scope creep.

---

## Post-MVP Roadmap (Phase 3+)

These features are explicitly **out of scope** for the MVP. Documented here to prevent scope creep.

| Feature | Dependency |
|---|---|
| Open matches | Player social graph |
| Find players / Complete Missing | Open matches |
| Subdomain routing (`club.padelclub.co`) | DNS config + Vercel |
| Push notifications | Mobile app or PWA |
| Online payments | Legal + payment gateway |
| Memberships | Payments |
| Mobile apps (iOS/Android) | Stable API |
| Advanced analytics | Data volume |
| Round Robin tournaments | Tournament module validation |

---

## Definition of Done (per feature)

A feature is done when:
1. TypeScript compiles with no errors (`npx tsc --noEmit`).
2. RLS policies are in place and tested (attempt unauthorized access → denied).
3. Mobile layout is tested at 390px viewport.
4. Desktop layout is tested at 1440px viewport.
5. Loading and error states are handled.
6. No `console.error` in production build.
7. Code reviewed and merged to `main`.
