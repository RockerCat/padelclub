# PadelClub — MVP Architecture

> Source of truth for technical decisions during MVP development.
> Last updated: 2026-06-13 (rev 5 — Sprint 3.3 complete, Dashboard 1.1, Operating Hours, Reservation UX, Validation Gate 1.0)

---

## 1. Project Overview

PadelClub is a **multi-tenant SaaS platform** for amateur padel clubs. Each club is an isolated tenant with its own players, reservations, tournaments, rankings, clinics, and branding.

**Vision:** Replace fragmented workflows (WhatsApp groups, Excel spreadsheets, paper notebooks) with a single digital platform that becomes the operational home of every club.

**Primary customer:** Club owner (makes adoption decisions, controls budget, benefits from visibility).

**Secondary users:** Club administrators (daily operations) and players (consume the experience).

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | 16.2.9 |
| UI Library | React | 19.2.4 |
| Language | TypeScript (strict) | 5.x |
| Styling | Tailwind CSS | 4.x |
| Backend / Auth | Supabase | @supabase/supabase-js ^2.108 |
| SSR Auth | @supabase/ssr | ^0.12.0 |
| Database | PostgreSQL (via Supabase) | — |
| Storage | Supabase Storage | — |
| Deployment | Vercel | — |
| Utilities | clsx, tailwind-merge | — |

---

## 3. Current Repository State

As of Sprint 3.3 (2026-06-13):

### Implemented

- Multi-club ownership
- Courts management
- Players & invitations
- Operating hours
- Reservation management
- Owner dashboard
- Dashboard analytics
- Smart slot picker
- Modal-based reservation workflows
- Role-specific navigation

### Current Phase

Validation Gate 1.0

### Operational Status

OWNER: operational
ADMIN: operational
PLAYER: functional, pending availability-first redesign

---

## 4. Proposed Folder Structure

```
Note:

The folder structure represents the target MVP architecture.

Some modules shown below (rankings, tournaments, clinics) are intentionally deferred and may not yet exist in the repository.

src/
  app/
    (marketing)/                    # public landing
    (app)/                          # authenticated app shell
      layout.tsx                    # auth guard, redirects unauthenticated to /auth/login
      [club]/                       # tenant scope — resolved by slug
        layout.tsx                  # club context provider, club branding
        page.tsx                    # role-aware entry route (redirects by role)
        dashboard/
          page.tsx                  # owner dashboard (requires OWNER role)
        admin/
          layout.tsx                # requires ADMIN or OWNER role
          courts/page.tsx
          reservations/page.tsx
          players/page.tsx
          tournaments/
            page.tsx
            [id]/page.tsx
            [id]/bracket/page.tsx
          clinics/
            page.tsx
            [id]/page.tsx
          settings/page.tsx         # club branding + configuration
          rankings/page.tsx         # ranking management
        reservations/
          page.tsx                  # player-facing calendar
        rankings/
          page.tsx                  # public ranking for club members
        tournaments/
          page.tsx
          [id]/page.tsx
        clinics/
          page.tsx
        profile/
          page.tsx
    auth/
      login/page.tsx
      signup/page.tsx
      callback/route.ts             # Supabase OAuth callback
    api/
      clubs/[club]/
        stats/route.ts              # owner dashboard metrics
  components/
    features/
      marketing/                    # existing landing components
      dashboard/                    # owner dashboard widgets
      reservations/                 # reservation UI
      tournaments/                  # bracket, participants
      rankings/                     # ranking table, entry
      players/                      # player card, profile
      clinics/                      # clinic card, registration
      clubs/                        # club settings, branding form
    layout/
      Navbar.tsx                    # marketing navbar (existing)
      Footer.tsx                    # marketing footer (existing)
      AppNav.tsx                    # authenticated app navigation
      ClubHeader.tsx                # club branding header
    ui/                             # shared primitives (Button, Card, Input, Badge...)
  lib/
    supabase/
      client.ts                     # browser client (createBrowserClient)
      server.ts                     # server client (createServerClient)
      middleware.ts                 # helper for middleware.ts at root
    utils/
      cn.ts                         # clsx + tailwind-merge (add immediately)
      rankings.ts                   # ranking calculation logic
  types/
    database.ts                     # generated Supabase types (supabase gen types)
    index.ts                        # re-exports and application types
  proxy.ts                          # at src/ root — session refresh (Next.js 16 convention)
```

---

## 5. Multi-Tenancy Architecture

### Strategy: Path-based slug routing

Every authenticated route is scoped under `/[club]`. The club slug resolves the tenant.

```
padelclub.co/platino-padel/dashboard
padelclub.co/padel-duitama/rankings
```

Subdomain routing (`platino.padelclub.co`) is architecturally possible via Next.js middleware rewriting to `[club]` paths but is **deferred to Phase 2**. The DB schema supports it with no changes.

Note:

This section describes the intended architecture and responsibilities.

Implementation details may evolve as the codebase matures.

### Middleware responsibilities

`src/middleware.ts` runs on every `/(app)/[club]/` request and must:

1. Verify the user is authenticated (Supabase session cookie).
2. Resolve the `club` slug to a `club_id` (cache in middleware or a short-lived lookup).
3. Verify the user is a member of that club (`club_members` row).
4. Attach the resolved `club_id` + `role` to request headers for Server Components.
5. Redirect unauthenticated users to `/auth/login?next=/[club]/...`.

```typescript
// src/middleware.ts (sketch — not implementation)
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clubSlug = extractClubSlug(pathname); // extract [club] segment

  const supabase = createServerClient(/* cookies */);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return redirectToLogin(request);

  const { data: member } = await supabase
    .from("club_members")
    .select("club_id, role, clubs!inner(slug)")
    .eq("clubs.slug", clubSlug)
    .eq("profile_id", user.id)
    .single();

  if (!member) return NextResponse.redirect(new URL("/unauthorized", request.url));

  // Inject club context into request headers
  const response = NextResponse.next();
  response.headers.set("x-club-id", member.club_id);
  response.headers.set("x-club-role", member.role);
  return response;
}
```

## Operating Hours Architecture

Operating hours are configured at the club level.

Current implementation:

- Per-day opening hours
- Per-day closing hours
- Closed day support
- Club-wide configuration

Data source:

club_operating_hours

Used by:

- Reservation validation
- Slot generation
- Availability calculations
- Occupancy metrics

Single source of truth:

src/lib/operatingHours.ts

No court-specific operating hours exist in the MVP.

---

## 6. Auth Architecture

**Provider:** Supabase Auth (email/password for MVP; OAuth optional).

**Session handling:** Cookie-based via `@supabase/ssr`. Sessions are refreshed transparently on every request by the middleware.

**Library setup required:**

```typescript
// src/lib/supabase/client.ts — REPLACE current file
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// src/lib/supabase/server.ts — CREATE
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
}
```

**Role enforcement layers:**

| Layer | Mechanism |
|---|---|
| Route access | Next.js middleware (checks `club_members.role`) |
| Data access | Supabase RLS policies |
| UI visibility | Role from middleware headers → conditionally render components |

---

## 7. Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # server-only, never expose to client
```

---

## 8. Shared UI Utilities

Add immediately before any feature development:

```typescript
// src/lib/utils/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

A `/components/ui/` directory should contain primitives (Button, Card, Input, Select, Badge, Modal) built with Tailwind 4 and the brand tokens from `globals.css`. Do not pull in a component library — keep the design system consistent with the existing landing page aesthetic.

---

## 9. Data Flow Patterns

### Server Components (default)
Fetch data directly in Server Components using the server Supabase client. No API route needed.

```typescript
// app/(app)/[club]/rankings/page.tsx
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export default async function RankingsPage() {
  const clubId = (await headers()).get("x-club-id")!;
  const supabase = await createClient();
  const { data } = await supabase
    .from("ranking_entries")
    .select("*, profiles(full_name, avatar_url)")
    .eq("ranking_id", ...) // resolved from clubId
    .order("position");
  return <RankingTable entries={data} />;
}
```

### Mutations
Use Next.js **Server Actions** (`"use server"`) for all writes. No API routes needed for CRUD.

### Route Handlers
Reserve `app/api/` for:
- Webhook receivers (Supabase triggers, future payment callbacks)
- Complex aggregation queries (owner dashboard stats)
- Third-party integrations

---

## 10. Automatic Rankings — Computation Strategy

Rankings must update automatically when match results are registered (CLAUDE.md Principle 2).

**Recommended approach:** Supabase **Database Trigger** on `match_results INSERT`.

```sql
-- Trigger fires after a match result is inserted
CREATE OR REPLACE FUNCTION update_ranking_on_result()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate points for all participants of the match
  -- Update ranking_entries positions
  -- This keeps ranking computation in the DB, not application code
  PERFORM recalculate_club_ranking(
    (SELECT club_id FROM matches WHERE id = NEW.match_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This ensures rankings are never stale regardless of which interface registers the result.

---

## 11. Architecture Review & Recommendations

### MVP Refinements (Post Sprint Review)

## Authentication & Club Access

### Public Landing

- Add "Login" button in header.
- Existing club owners, admins and players must be able to access their club from the landing page.

### Post Login Navigation

#### Single Club Membership

If the user belongs to exactly one club:

OWNER  → /{slug}/dashboard
ADMIN  → /{slug}/admin/reservations
PLAYER → /{slug}/reservations

#### Multiple Club Memberships

If the user belongs to multiple clubs:

- Show club selector.
- User chooses which club to enter.

### Role Experiences

The platform must support three experiences:

- OWNER
- ADMIN
- PLAYER

The current dashboard is considered an OWNER dashboard.
A dedicated availability-first PLAYER experience is planned after Validation Gate 1.0.

#### Club Selection Priority

If the user belongs to only one club:
- Enter directly.

If the user belongs to multiple clubs:
- Show club selector.

The system should remember the last selected club and use it as the default destination on future logins.

### R1 — Supabase SSR client ✅ resolved in Sprint 0
`src/lib/supabase/client.ts` now uses `createBrowserClient` from `@supabase/ssr`. `src/lib/supabase/server.ts` created with `createServerClient`. `src/proxy.ts` handles session refresh on every request.

### R2 — Padel-specific domain model: pairs, not individuals
**Decision:** Padel is a doubles sport. For MVP, pairs are modeled using `profile_id` + `partner_id` on `tournament_participants`. This is intentionally simple and sufficient for single-elimination bracket generation. A dedicated `pairs` table is **deferred** until the product requires persistent team history across multiple tournaments. Do not create a `pairs` table in the MVP.

### R3 — No `seasons` entity
**Risk:** MEDIUM. Rankings and tournaments without a season concept will become unmanageable after 3–4 tournaments. Even a simple `season text` column on `rankings` and `tournaments` tables defers this problem cheaply.

### R4 — RLS policy performance
**Risk:** MEDIUM. Calling `SELECT` on `club_members` in every RLS policy creates N+1 query patterns at the database level. Mitigation: use a PostgreSQL helper function `auth.is_club_member(club_id)` and `auth.club_role(club_id)` marked as `STABLE` so Postgres caches the result per transaction.

```sql
CREATE OR REPLACE FUNCTION auth.club_role(p_club_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.club_members
  WHERE club_id = p_club_id AND profile_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;
```

### R5 — Club onboarding flow is undefined
**Risk:** MEDIUM. How does a new club get created? Who creates the first OWNER member? A self-serve onboarding flow (`/onboarding`) is needed in Sprint 1 before any club-specific feature can be tested end-to-end.

### R6 — Player invitation flow
**Risk:** MEDIUM. Players need a way to join a club. Without an invitation mechanism, the admin must manually create player accounts. Consider an `invitation_links` table with a short-lived token that auto-creates the `club_members` row on signup.

### R7 — `club_id` denormalization
**Recommendation:** Denormalize `club_id` into tables like `ranking_entries`, `clinic_registrations`, and `match_players`. This allows RLS policies to filter directly on `club_id` without expensive JOINs, and keeps row-level security simple and fast.

### R8 — No `cn()` utility yet ✅ resolved in Sprint 0
`src/lib/utils/cn.ts` created with `clsx` + `tailwind-merge`.

### R9 — `lang` attribute on root HTML ✅ resolved in Sprint 0
`src/app/layout.tsx` now sets `lang="es"`.

### R10 — No `players` table (by design)
**Clarification:** There is no `players` table in PadelClub. The data model for players is: `auth.users → profiles → club_members (role = 'PLAYER')`. Any code or query that refers to "players" must target `club_members JOIN profiles WHERE role = 'PLAYER'`. Creating a separate `players` table would duplicate `profiles` data and create sync issues across multi-club membership.

### R11 — Ranking formula must be decided before implementation
**Risk:** HIGH for trust. The automatic ranking trigger cannot be written until the points formula is agreed upon with a real club owner. A ranking that assigns wrong points — or changes after players have competed — destroys credibility. This decision must happen before Sprint 5 begins. Hardcoded constants are acceptable for MVP. A `ranking_rules` table is a Phase 2 option if clubs need per-club customization.

## Role Experience Architecture

Three distinct experiences exist in the platform.

### OWNER

Entry:

`/{slug}/dashboard`

Primary workflows:

- Dashboard
- Reservations
- Players
- Courts
- Club configuration
- Multi-club management

The owner is the primary customer.

### ADMIN

Entry:

`/{slug}/admin/reservations`

Primary workflows:

- Reservation management
- Player management
- Court management

Restrictions:

- No dashboard access
- No configuration access

Administrators focus on daily operations.

### PLAYER

Entry:

`/{slug}/reservations`

Current focus:

- Reservation visibility

Validation in progress:

- Availability-first experience
- Reservation request workflow

Future focus:

- Tournament registration
- Ranking visibility

Players are secondary users.

Player experiences should prioritize action over administration.

## Post-Login Routing Logic

```text
login success
  │
  ├── ?next= param present → follow next
  │
  ├── 0 clubs → /onboarding
  │
  ├── 1 club → getClubEntryPath(slug, role)
  │     OWNER  → /{slug}/dashboard
  │     ADMIN  → /{slug}/admin/reservations
  │     PLAYER → /{slug}/reservations
  │
  └── 2+ clubs → /clubs
```

#### `getClubEntryPath(slug, role)` — Canonical navigation utility

Defined in `src/lib/utils/navigation.ts`. Must be used in:
- `LoginForm.tsx` (post-login redirect)
- `/clubs` page (club selector)
- Any future redirect after club context is established

Do not hardcode role-based paths anywhere else.

## Reservations Architecture

Reservations are the core operational entity of PadelClub.

### Creation

OWNER and ADMIN can create reservations.

PLAYER reservation requests are currently under evaluation during Validation Gate.

### Validation Rules

Reservations must:

- Belong to an active court
- Respect operating hours
- Respect closed days
- Not overlap existing reservations
- Not exist in the past

All validation occurs server-side.

### Scheduling

Available slots are generated dynamically using:

- Operating hours
- Existing reservations
- Reservation duration

### Editing

Reservations support:

- Update
- Reschedule
- Cancellation

### Privacy

Player-facing reservation experiences should prioritize availability over exposing reservation details.

## Reservation UX Architecture

PadelClub is operational software.

Operational users repeat the same actions frequently.

Current reservation UX is modal-first.

Goals:

- Preserve calendar context
- Reduce page transitions
- Minimize friction
- Accelerate repetitive workflows

Current implementation:

- Create reservation modal
- Edit reservation modal
- Cancel reservation modal
- Smart slot picker

Users should remain inside the calendar whenever possible.

## 12. Multi-Club Ownership

### Core Rule: Account ≠ Club

A PadelClub account and a club are independent entities. Creating an account does not create a club. Joining a club does not create a new account.

One account can:
- be `OWNER` of multiple clubs
- be `ADMIN` of multiple clubs
- be `PLAYER` in multiple clubs
- hold different roles in different clubs simultaneously (e.g., OWNER in Club A, PLAYER in Club B)

### Data Model

Roles are stored in `club_members (club_id, profile_id, role)`. There is no global role on `profiles`. Every role query must be scoped to a specific `club_id`.

```
auth.users (1) ──→ (N) club_members ──→ (N) clubs
                         role: OWNER | ADMIN | PLAYER
                         is_active: boolean
```

### Route Responsibilities

| Route | Purpose | Who uses it |
|---|---|---|
| `/auth/signup` | Create account (no club created) | Anyone new to the platform |
| `/onboarding` | Create the **first** club after account creation | Authenticated user with 0 clubs |
| `/clubs/create` | Create an **additional** club | Authenticated user with 1+ clubs |
| `/clubs` | Select which club to enter | Any user with 1+ clubs |

### Routing Behavior

#### `/onboarding`
- Not authenticated → `/auth/login`
- 0 clubs → show form
- 1+ clubs → `/clubs`

#### `/clubs`
- Not authenticated → `/auth/login`
- 0 clubs → `/onboarding`
- 1+ clubs → always show the selector (no auto-redirect)
  - Only the login flow redirects directly when there is exactly 1 club

#### `/clubs/create`
- Not authenticated → `/auth/login?next=/clubs/create`
- Authenticated → show form (creates club + OWNER membership, then → /{slug}/dashboard)

#### Post-login routing
```
login success
  │
  ├── ?next= param present → follow next
  │
  ├── 0 clubs → /onboarding
  │
  ├── 1 club → getClubEntryPath(slug, role)   ← only login does this auto-redirect
  │
  └── 2+ clubs → /clubs
```

### Landing Page CTA

"Crear mi club" on the marketing Navbar behaves differently based on session state:

| State | Destination |
|---|---|
| Not authenticated | `/auth/signup` |
| Authenticated | `/clubs/create` |

The check runs client-side via `supabase.auth.getSession()` in a `useEffect`. Default href is `/auth/signup` (no flash for unauthenticated visitors).

### AppNav: OWNER-only actions

| Action | Role | Condition |
|---|---|---|
| Cambiar de club | any | membershipCount ≥ 2 |
| Crear otro club | OWNER only | always visible |

### Invitation Rules

Invitation links are scoped to a single club. Accepting an invitation does not affect the user's membership in other clubs. If the invited user already belongs to the club, `claim_invitation` returns an error.

## Analytics Architecture

Dashboard 1.1 is implemented.

Current metrics:

- Reservations this week
- Reserved hours
- Weekly occupancy
- Active players
- Court occupancy
- Peak reservation hour
- Cancellation rate
- Previous week comparison

Analytics are operational.

The objective is helping owners understand utilization and activity inside the club.

## MVP Scope Guardrails

Current MVP priorities:

1. Reservations
2. Courts
3. Players
4. Club administration
5. Operational analytics

The following modules are intentionally deferred:

- Rankings
- Tournaments
- Clinics
- Payments
- Mobile applications
- Community features

When prioritization conflicts arise:

Reservations and owner value take precedence.

## Validation Gate 1.0

Current objective:

- Validate operational workflows
- Remove friction
- Verify permissions
- Improve usability
- Test real-world club usage

Recent findings already corrected:

- OWNER incorrect landing page
- ADMIN placeholder landing page
- PLAYER placeholder landing page
- Staff appearing as selectable players
- Past reservations allowed

Before Sprint 4:

- Complete role validation
- Refine player experience
- Validate availability workflows