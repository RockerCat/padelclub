# PadelClub — MVP Architecture

> Source of truth for technical and product architecture decisions during MVP development.
>
> Last updated: June 2026 (rev 6 — Owner Experience, Club Identity, Public Club Profiles, Reservation Approval Flow)

---

# 1. Project Overview

PadelClub is a multi-tenant SaaS platform for amateur padel clubs.

Each club is an isolated tenant with its own:

* Members
* Roles
* Courts
* Reservations
* Operating hours
* Branding
* Public profile
* Reservation rules

## Vision

PadelClub should become the digital home of an amateur sports club.

The goal is not to build a complex ERP.

The goal is not to build a social network.

The goal is to replace fragmented workflows currently handled through:

* WhatsApp
* Excel
* Paper notebooks
* Manual scheduling

## Primary Customer

The primary customer is the club owner.

Club owners:

* Make adoption decisions
* Control budgets
* Benefit from operational visibility
* Need to reduce administrative dependency
* Care about occupancy and club growth

## Secondary Users

### Administrators

Administrators operate the club day to day.

They manage:

* Reservations
* Players
* Courts
* Reservation approvals

### Players

Players consume the experience.

They care about:

* Finding clubs
* Joining clubs
* Seeing availability
* Requesting reservations
* Tracking their own reservations

---

# 2. Tech Stack

| Layer        | Technology              | Version                      |
| ------------ | ----------------------- | ---------------------------- |
| Framework    | Next.js App Router      | 16.2.9                       |
| UI Library   | React                   | 19.2.4                       |
| Language     | TypeScript strict       | 5.x                          |
| Styling      | Tailwind CSS            | 4.x                          |
| Backend/Auth | Supabase                | @supabase/supabase-js ^2.108 |
| SSR Auth     | @supabase/ssr           | ^0.12.0                      |
| Database     | PostgreSQL via Supabase | —                            |
| Storage      | Supabase Storage        | —                            |
| Deployment   | Vercel                  | —                            |
| Utilities    | clsx, tailwind-merge    | —                            |

---

# 3. Current Repository State

As of June 2026:

## Implemented

* Public landing page
* Authentication
* Multi-club ownership
* Club creation
* Club selector
* Public club directory
* Public club profile pages
* Club visibility: public/private
* Club branding
* Club logo
* Club cover image
* Owner dashboard
* Dashboard club hero
* Owner onboarding checklist
* Courts management
* Players and invitations
* Operating hours
* Reservation management
* Player reservation requests
* Owner/Admin reservation approval
* Configurable reservation durations
* Smart slot picker
* Modal-based reservation workflows
* Dashboard analytics
* Role-specific navigation

## Current Phase

Validation Gate 1.0

## Operational Status

| Role   | Status                                                          |
| ------ | --------------------------------------------------------------- |
| OWNER  | Operational, onboarding under refinement                        |
| ADMIN  | Operational                                                     |
| PLAYER | Functional, availability-first experience still being validated |

---

# 4. Folder Structure

The following represents the current and intended MVP architecture.

Some modules shown below, such as rankings, tournaments, and clinics, are intentionally deferred and may not yet be implemented.

```text
src/
  app/
    (marketing)/
      page.tsx                         # public landing

    auth/
      login/page.tsx
      signup/page.tsx
      callback/route.ts

    clubs/
      page.tsx                         # public/authenticated club directory
      create/page.tsx                  # create a new club
      [slug]/page.tsx                  # public club profile

    onboarding/
      page.tsx                         # legacy/alias route, redirects to /clubs/create

    (app)/
      layout.tsx                       # authenticated app shell
      [club]/
        layout.tsx                     # club context, membership guard, branding
        page.tsx                       # role-aware entry route

        dashboard/
          page.tsx                     # OWNER dashboard

        admin/
          layout.tsx                   # OWNER/ADMIN guard
          reservations/
            page.tsx
            new/page.tsx
            [id]/page.tsx
          courts/page.tsx
          players/page.tsx
          settings/page.tsx

        reservations/
          page.tsx                     # PLAYER-facing reservations / availability

        profile/
          page.tsx

    api/
      clubs/[club]/
        stats/route.ts                 # owner dashboard metrics / aggregations

  components/
    features/
      dashboard/
      reservations/
      players/
      courts/
      clubs/
      marketing/

    layout/
      Navbar.tsx
      Footer.tsx
      AppNav.tsx
      ClubHero.tsx                     # shared club hero / identity component

    ui/
      Button.tsx
      Card.tsx
      Input.tsx
      Badge.tsx
      Modal.tsx

  lib/
    supabase/
      client.ts
      server.ts
      middleware.ts

    utils/
      cn.ts
      navigation.ts

    operatingHours.ts
    durations.ts

  types/
    database.ts
    index.ts

  proxy.ts                             # Next.js 16 session refresh
```

---

# 5. Multi-Tenancy Architecture

## Strategy

PadelClub uses path-based tenant routing.

Authenticated club routes are scoped under:

```text
/[club]/*
```

Examples:

```text
/alex-club-padel/dashboard
/alex-club-padel/admin/reservations
/alex-club-padel/reservations
```

The `[club]` segment is the club slug.

## Core Rule

Account is not the same as club.

A user account can exist without belonging to any club.

A user may belong to multiple clubs.

A user may have different roles across clubs.

Example:

```text
auth.users
  ↓
profiles
  ↓
club_members
  ↓
clubs
```

Roles are stored per club in:

```text
club_members.role
```

There is no global user role.

---

# 6. Club Identity Architecture

A club is both:

1. An operational entity
2. A branded public entity

Each club may define:

* Name
* Slug
* Description
* Logo
* Cover image
* Colors
* Visibility
* Location
* Contact information

## Design Principle

The owner dashboard and public club page should share the same visual identity.

The owner should feel:

```text
This is my club.
```

not:

```text
This is a generic admin panel.
```

## Shared Club Hero

The public club profile and owner dashboard should reuse the same club identity system.

Shared elements:

* Cover image
* Logo
* Club name
* Location
* Public/private badge
* Description
* Owner actions when applicable

## Default Cover

If a club does not have a custom cover image, use:

```text
/public/img/portada-default.png
```

This prevents newly created clubs from feeling empty.

---

# 7. Club Visibility Architecture

Clubs support visibility configuration.

## Values

```text
public
private
```

## Public Clubs

Public clubs:

* Appear in the club directory
* Have public profile pages
* May support direct join flows
* Are discoverable by anonymous visitors

## Private Clubs

Private clubs:

* Show a private badge
* Require approval or invitation-based access
* May still have a public-facing profile
* Should clearly communicate that access requires approval

## Directory Behavior

The `/clubs` page is public.

Anonymous users can:

* Browse public club information
* Search clubs
* View public club profiles

Authenticated users can:

* See their own clubs
* Explore other clubs
* Enter clubs they belong to
* Request access or join depending on visibility

---

# 8. Auth Architecture

## Provider

Supabase Auth.

MVP supports:

* Email/password
* Invite-based signup

OAuth is optional and deferred.

## Session Handling

Sessions are cookie-based through `@supabase/ssr`.

Sessions are refreshed through the Next.js proxy/middleware layer.

## Email Confirmation

During development, email confirmation may be disabled to speed up testing.

Before public beta, email confirmation should be re-enabled and tested end-to-end.

## Signup Behavior

A new account does not automatically create a club.

Post-signup flow:

```text
Signup
  ↓
/clubs
  ↓
Create club or explore clubs
```

## Login Behavior

Current preferred behavior:

```text
Login
  ↓
/clubs
```

The `/clubs` page acts as the authenticated home for multi-club users.

---

# 9. Route Access Architecture

## Public Routes

| Route           | Purpose             |
| --------------- | ------------------- |
| `/`             | Public landing      |
| `/clubs`        | Club directory      |
| `/clubs/[slug]` | Public club profile |
| `/auth/login`   | Login               |
| `/auth/signup`  | Signup              |

## Authenticated Routes

| Route                        | Purpose                  |
| ---------------------------- | ------------------------ |
| `/clubs/create`              | Create a club            |
| `/[club]`                    | Role-aware club entry    |
| `/[club]/dashboard`          | OWNER dashboard          |
| `/[club]/admin/reservations` | OWNER/ADMIN reservations |
| `/[club]/admin/courts`       | OWNER/ADMIN courts       |
| `/[club]/admin/players`      | OWNER/ADMIN players      |
| `/[club]/admin/settings`     | OWNER settings           |
| `/[club]/reservations`       | PLAYER reservations      |

---

# 10. Role Experience Architecture

## OWNER

Entry:

```text
/{slug}/dashboard
```

Primary workflows:

* Owner dashboard
* Public profile management
* Branding
* Reservations
* Courts
* Players
* Settings
* Club configuration
* Multi-club management

The owner is the primary customer.

---

## ADMIN

Entry:

```text
/{slug}/admin/reservations
```

Primary workflows:

* Reservation management
* Reservation approval
* Player management
* Court management

Restrictions:

* No owner dashboard
* No global settings
* No branding management

---

## PLAYER

Entry:

```text
/{slug}/reservations
```

Primary workflows:

* View availability
* Request reservations
* Track own reservations
* Join or request access to clubs

Players should not see operational or private administrative information.

---

# 11. Canonical Navigation

All role-based redirects should use:

```ts
getClubEntryPath(slug, role)
```

Expected behavior:

```text
OWNER  → /{slug}/dashboard
ADMIN  → /{slug}/admin/reservations
PLAYER → /{slug}/reservations
```

Do not hardcode role-based paths elsewhere.

---

# 12. Owner Onboarding Architecture

The owner onboarding flow should guide a new club from creation to operational readiness.

## Flow

```text
Signup
  ↓
/clubs
  ↓
/clubs/create
  ↓
/{slug}/dashboard?new=1
  ↓
Onboarding checklist
```

## Checklist

Current onboarding checklist:

1. Personalize public page
2. Add first court
3. Configure operating hours
4. Invite first player
5. Create first reservation

## Principles

* The owner should never land first on a complex settings form.
* The dashboard is the first meaningful owner experience.
* Empty states should guide the next correct action.
* If there are no courts, do not prompt the owner to create a reservation.
* Branding and public profile setup are part of adoption, not optional decoration.

---

# 13. Club Assets Architecture

Club assets include:

* Logo
* Cover image

Current fields:

```text
clubs.logo_url
clubs.cover_image_url
```

## Storage

Use Supabase Storage for uploaded club assets.

Recommended bucket:

```text
club-assets
```

Suggested path structure:

```text
club-assets/
  clubs/
    {clubId}/
      logo-{timestamp}.{ext}
      cover-{timestamp}.{ext}
```

## Upload Rules

Only OWNER can update:

* logo_url
* cover_image_url

Validation:

* image/jpeg
* image/png
* image/webp

Suggested limits:

* Logo: 2 MB
* Cover: 5 MB

Assets are public because they appear on public club pages.

---

# 14. Operating Hours Architecture

Operating hours are configured at the club level.

Current implementation:

* Per-day opening hours
* Per-day closing hours
* Closed day support
* Club-wide configuration

Data source:

```text
club_operating_hours
```

Used by:

* Reservation validation
* Slot generation
* Availability calculations
* Occupancy metrics

Single source of truth:

```text
src/lib/operatingHours.ts
```

No court-specific operating hours exist in the MVP.

Per-court operating hours are deferred until real club needs validate the complexity.

---

# 15. Reservation Architecture

Reservations are the core operational entity of PadelClub.

## Reservation Types

```text
MATCH
CLASS
BLOCK
```

## Reservation Statuses

```text
PENDING
CONFIRMED
CANCELLED
```

## Staff-Created Reservations

OWNER and ADMIN can create confirmed operational reservations.

Typical use cases:

* Match booking
* Class
* Maintenance block
* Private block

## Player Reservation Requests

Players create reservation requests.

Flow:

```text
PLAYER
  ↓
Create request
  ↓
PENDING
  ↓
OWNER / ADMIN approval
  ↓
CONFIRMED or CANCELLED
```

This is now the official MVP player reservation model.

---

# 16. Reservation Validation Rules

All reservation validation must happen server-side.

Rules:

1. Court must belong to the club.
2. Court must be active.
3. Reservation must not be in the past.
4. Reservation must fit inside operating hours.
5. Reservation cannot be created on a closed day.
6. Reservation cannot overlap a non-cancelled reservation.
7. Duration must be allowed by the club.
8. Player-created reservations must start as PENDING.
9. OWNER/ADMIN approval is required before becoming CONFIRMED.

Client-side validation improves UX but cannot be trusted.

---

# 17. Reservation Duration Architecture

Reservation durations are configured per club.

Source:

```text
clubs.allowed_reservation_durations
```

Supported catalog:

```text
60
90
120
150
180
```

Single source of truth:

```text
src/lib/durations.ts
```

All reservation creation and update flows must validate duration against the club configuration.

Applies to:

* OWNER reservations
* ADMIN reservations
* PLAYER reservation requests
* Slot generation
* Availability filtering

---

# 18. Player Privacy Architecture

Player-facing reservation experiences should prioritize availability over operational detail.

Players may see:

* Available slots
* Their own reservation requests
* Status of their own requests
* Confirmed reservations they created

Players should not see:

* Other players' names
* Internal notes
* Operational blocks
* Staff activity
* Reservation titles unless explicitly intended

Availability should be computed from:

* Courts
* Operating hours
* Non-cancelled reservations
* Current date/time

---

# 19. Data Flow Patterns

## Server Components

Default pattern:

* Fetch data directly in Server Components.
* Use Supabase server client.
* Avoid unnecessary API routes.

## Server Actions

Use Server Actions for mutations.

Examples:

* Create reservation
* Approve reservation
* Reject reservation
* Update club settings
* Upload club asset
* Create court
* Invite player

## Route Handlers

Use route handlers only for:

* Webhooks
* Complex aggregations
* Third-party integrations
* Dashboard analytics endpoints

---

# 20. Supabase Client Architecture

## Browser Client

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

## Server Client

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}
```

---

# 21. RLS Architecture

RLS is mandatory.

Every tenant-scoped table must enforce access by club membership.

## Helper Functions

Use helper functions to avoid expensive repeated policy logic.

```sql
auth.club_role(club_id)
auth.is_club_member(club_id)
```

## Core Rules

* OWNER can manage club settings.
* OWNER and ADMIN can manage operations.
* PLAYER can access player-facing workflows.
* Anonymous users may read public club data only.
* Service role must never be exposed to the client.

---

# 22. Public Club Data Architecture

Some club data is intentionally public.

Public data may include:

* Name
* Slug
* Description
* Logo
* Cover image
* Visibility
* City
* Country
* Contact information
* Public profile content

Private data includes:

* Members
* Reservations
* Internal notes
* Player details
* Operational blocks
* Admin activity

Public profile pages must never expose private tenant data.

---

# 23. Dashboard Architecture

The owner dashboard has two responsibilities:

1. Represent the club identity.
2. Show operational readiness and activity.

## Dashboard Sections

Current intended structure:

```text
Club Hero
  ↓
Onboarding Checklist
  ↓
Metrics / Empty State
  ↓
Quick Actions
```

## Empty State Logic

If no active courts exist:

```text
Prompt: Add first court
```

If courts exist but no reservations exist:

```text
Prompt: Create first reservation
```

The dashboard should guide the next correct operational action.

---

# 24. Analytics Architecture

Dashboard analytics currently derive from reservation data.

Current metrics:

* Reservations this week
* Reserved hours
* Weekly occupancy
* Active players
* Court occupancy
* Peak reservation hour
* Cancellation rate
* Previous week comparison

Analytics are operational but still under validation.

The goal is to learn which metrics owners actually care about.

---

# 25. Automatic Rankings Architecture

Rankings are deferred.

When implemented, ranking updates should be automatic.

Recommended strategy:

* Database trigger on match result insert
* Recalculate ranking entries from trusted match result data
* Do not depend on manual admin updates

Important:

The ranking formula must be validated with real club owners before implementation.

Incorrect ranking logic damages trust.

---

# 26. Deferred Modules

The following modules are intentionally deferred until MVP validation is stronger:

* Rankings
* Tournaments
* Clinics
* Payments
* Mobile applications
* Community features
* Open matches
* Find players
* Membership billing
* Push notifications

These should not displace owner onboarding, reservations, courts, players, and club identity.

---

# 27. MVP Scope Guardrails

Current MVP priorities:

1. Owner onboarding
2. Reservations
3. Courts
4. Players
5. Club identity
6. Club discovery
7. Operational analytics

When prioritization conflicts arise:

* Owner value wins.
* Reservation workflows win.
* Operational simplicity wins.
* Real adoption beats feature count.

---

# 28. Validation Gate 1.0

Current objective:

Validate operational workflows with real clubs.

Validation focus:

* Owner onboarding
* Club setup
* Court creation
* Operating hours
* Player invitations
* Reservation requests
* Reservation approvals
* Dashboard usefulness
* Public club profile usefulness

Before building major new modules:

* Validate real club usage.
* Collect owner feedback.
* Collect admin feedback.
* Observe player behavior.
* Remove workflow confusion.

---

# 29. Definition of Done

A feature is complete when:

1. TypeScript compiles successfully.
2. RLS policies exist and are tested.
3. Mobile layout is validated.
4. Desktop layout is validated.
5. Loading states are implemented.
6. Error states are implemented.
7. Empty states are meaningful.
8. No production console errors remain.
9. Code review completed.
10. Merged into main branch.

---

# 30. Core Architectural Principle

PadelClub is not only a reservation system.

PadelClub is the operational and digital identity layer of a club.

The product should help owners:

* See their club
* Configure their club
* Operate their club
* Grow their club

without creating unnecessary complexity.
