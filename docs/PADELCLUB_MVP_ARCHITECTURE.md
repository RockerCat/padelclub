# PadelClub — MVP Architecture

> Source of truth for technical decisions during MVP development.
> Last updated: 2026-06-10 (rev 2 — player model clarified, R2/R10/R11 added)

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

```
src/
  app/
    (marketing)/          ← public landing page (complete)
      layout.tsx          ← Navbar + Footer
      page.tsx            ← / route
    layout.tsx            ← root layout (Geist fonts, metadata)
    globals.css           ← Tailwind 4 @theme tokens
    favicon.ico
  components/
    features/
      marketing/          ← Hero, PainPoints, Features, Audience
    layout/               ← Navbar, Footer
  lib/
    supabase/
      client.ts           ← browser Supabase client (needs refactor)
public/
  branding/               ← logo-primary.png, logo-icon.png
assets/
  branding/               ← source logo files
docs/                     ← this directory (new)
```

**⚠ Critical gap:** `src/lib/supabase/client.ts` uses a bare `createClient` call. This must be replaced with the `@supabase/ssr` pattern before any authenticated code is written.

---

## 4. Proposed Folder Structure

```
src/
  app/
    (marketing)/                    # public landing
    (app)/                          # authenticated app shell
      layout.tsx                    # auth guard, redirects unauthenticated to /auth/login
      [club]/                       # tenant scope — resolved by slug
        layout.tsx                  # club context provider, club branding
        page.tsx                    # player portal home (activity feed, quick links)
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
