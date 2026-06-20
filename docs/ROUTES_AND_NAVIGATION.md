# PadelClub — Routes & Navigation

> Source of truth for routing, navigation, role-based access and user entry points.
>
> Last updated: June 2026 (rev 4 — Club Identity, Club Discovery, Owner Onboarding, Validation Gate 1.0)

---

# Route Groups Overview

| Group         | Path Prefix   | Description                                     | Auth Required |
| ------------- | ------------- | ----------------------------------------------- | ------------- |
| `(marketing)` | `/`           | Public marketing website                        | No            |
| `auth`        | `/auth/...`   | Authentication flows                            | No            |
| `clubs`       | `/clubs...`   | Club discovery and club management entry points | Partial       |
| `(app)`       | `/[club]/...` | Authenticated club experience                   | Yes           |

---

# Navigation Principles

## Club-Centric Navigation

PadelClub is club-centric.

Users do not enter the application through a generic dashboard.

Users enter through clubs.

Examples:

```text
/alex-padel-club/dashboard
/alex-padel-club/admin/reservations
/alex-padel-club/reservations
```

The club slug is the tenant identifier.

---

## Multi-Club First

A user may belong to:

* zero clubs
* one club
* many clubs

Navigation must always support multi-club membership.

Never assume:

```text
1 user = 1 club
```

---

## Role-Based Experiences

Navigation depends on:

* authenticated user
* selected club
* role within that club

Supported roles:

```text
OWNER
ADMIN
PLAYER
```

---

## Canonical Entry Function

All role redirects must use:

```ts
getClubEntryPath(slug, role)
```

Expected behavior:

```text
OWNER  → /{slug}/dashboard
ADMIN  → /{slug}/admin/reservations
PLAYER → /{slug}/reservations
```

Do not hardcode role destinations elsewhere.

---

# Public Routes

## Landing Page

```text
/
```

Purpose:

Public marketing website.

Primary actions:

* Create my club
* Log in
* Explore clubs

Audience:

* Club owners
* Administrators
* Players

---

## Login

```text
/auth/login
```

Purpose:

Authenticate existing users.

Post-login behavior:

```text
0 clubs
  ↓
/clubs

1+ clubs
  ↓
/clubs
```

The club directory acts as the authenticated home screen.

---

## Signup

```text
/auth/signup
```

Purpose:

Create a new account.

The signup flow does not automatically create a club.

Post-signup:

```text
/clubs?welcome=1
```

---

## Forgot Password

```text
/auth/forgot-password
```

Purpose:

Password recovery.

---

# Club Directory

## Club Directory

```text
/clubs
```

Authentication:

Public

Purpose:

Primary club discovery experience.

The `/clubs` route serves multiple audiences:

### Anonymous Visitors

Can:

* Search clubs
* Browse clubs
* View public club profiles

Cannot:

* Join clubs
* Request access
* Access club operations

---

### Authenticated Users

Can:

* View their clubs
* Explore other clubs
* Join clubs
* Request access to clubs
* Create clubs (owners)

---

## Welcome Mode

```text
/clubs?welcome=1
```

Purpose:

Post-signup onboarding.

Behavior:

If:

```text
Authenticated
AND
0 clubs
AND
welcome=1
```

Show:

```text
Account created
↓
Create my club
```

Hide:

* Club exploration
* Discovery content

The goal is to reduce distraction immediately after signup.

---

## Create Club

```text
/clubs/create
```

Authentication:

Required

Purpose:

Create a new club.

Creates:

* Club
* OWNER membership

Redirect:

```text
/{slug}/dashboard?new=1
```

---

# Public Club Profiles

## Club Profile

```text
/clubs/[slug]
```

Authentication:

Public

Purpose:

Public-facing club profile.

Features:

* Club cover image
* Club logo
* Club name
* Description
* Public/private status
* Membership CTA

Audience:

* Prospective players
* Visitors
* Owners

---

## Public Club Visibility

### Public Club

May display:

* Club information
* Join CTA
* Contact information

---

### Private Club

May display:

* Club information
* Private badge
* Request access CTA

Must clearly communicate that membership approval is required.

---

# Authenticated Club Experience

All club functionality is scoped under:

```text
/[club]/*
```

Example:

```text
/alex-padel-club/*
```

---

## Club Root

```text
/[club]
```

Purpose:

Role-aware entry route.

Behavior:

```text
OWNER
  ↓
/[club]/dashboard

ADMIN
  ↓
/[club]/admin/reservations

PLAYER
  ↓
/[club]/reservations
```

This route should not render content.

It exists only for redirects.

---

# OWNER Routes

Accessible only to:

```text
OWNER
```

---

## Dashboard

```text
/[club]/dashboard
```

Purpose:

Owner home screen.

Current responsibilities:

* Club identity
* Club onboarding
* Operational visibility
* Quick actions

Sections:

```text
Club Hero
↓
Onboarding Checklist
↓
Metrics / Empty State
↓
Quick Actions
```

---

## New Club Mode

```text
/[club]/dashboard?new=1
```

Purpose:

First owner experience.

Displays:

* Welcome state
* Onboarding checklist

Current checklist:

```text
1. Personalize public page
2. Add first court
3. Configure operating hours
4. Invite first player
5. Create first reservation
```

---

# Shared Member Routes

Accessible to:

```text
OWNER
ADMIN
PLAYER
```

---

## Reservations

```text
/[club]/reservations
```

Purpose:

Player-facing reservation experience.

Current direction:

Availability-first workflow.

Supported actions:

* View availability
* Request reservation
* Track reservation status

---

## Profile

```text
/[club]/profile
```

Purpose:

Personal account information.

Future:

* Preferences
* Notification settings
* Membership information

---

# Admin Routes

Accessible to:

```text
OWNER
ADMIN
```

Blocked for:

```text
PLAYER
```

---

## Admin Root

```text
/[club]/admin
```

Redirect:

```text
/ [club]/admin/reservations
```

---

## Reservations

```text
/[club]/admin/reservations
```

Primary operational screen.

Features:

* Weekly calendar
* Create reservation
* Edit reservation
* Cancel reservation
* Approve reservation requests
* Reject reservation requests
* Operating hours validation

---

## Courts

```text
/[club]/admin/courts
```

Features:

* Create court
* Edit court
* Activate/deactivate court

---

## Players

```text
/[club]/admin/players
```

Features:

* View members
* Invite players
* Invite administrators
* Manage memberships

Important:

Players are not stored in a dedicated table.

Players are:

```text
club_members.role = 'PLAYER'
```

---

## Settings

```text
/[club]/admin/settings
```

Role:

OWNER only

Features:

* Club information
* Branding
* Visibility
* Operating hours
* Reservation configuration

ADMIN cannot access this route.

---

# Permission Matrix

| Route                        | OWNER | ADMIN | PLAYER | ANON |
| ---------------------------- | :---: | :---: | :----: | :--: |
| `/`                          |   ✓   |   ✓   |    ✓   |   ✓  |
| `/clubs`                     |   ✓   |   ✓   |    ✓   |   ✓  |
| `/clubs/create`              |   ✓   |   ✓   |    ✓   |   —  |
| `/clubs/[slug]`              |   ✓   |   ✓   |    ✓   |   ✓  |
| `/[club]`                    |   ✓   |   ✓   |    ✓   |   —  |
| `/[club]/dashboard`          |   ✓   |   —   |    —   |   —  |
| `/[club]/reservations`       |   ✓   |   ✓   |    ✓   |   —  |
| `/[club]/profile`            |   ✓   |   ✓   |    ✓   |   —  |
| `/[club]/admin`              |   ✓   |   ✓   |    —   |   —  |
| `/[club]/admin/reservations` |   ✓   |   ✓   |    —   |   —  |
| `/[club]/admin/courts`       |   ✓   |   ✓   |    —   |   —  |
| `/[club]/admin/players`      |   ✓   |   ✓   |    —   |   —  |
| `/[club]/admin/settings`     |   ✓   |   —   |    —   |   —  |

---

# Navigation Architecture

## OWNER Navigation

```text
Dashboard

Operación
├─ Reservaciones
├─ Canchas
└─ Jugadores

Club
├─ Página Pública
└─ Configuración

Mi Perfil

Cambiar Club
Crear Club
Salir
```

---

## ADMIN Navigation

```text
Reservaciones

Administración
├─ Canchas
└─ Jugadores

Mi Perfil

Cambiar Club
Salir
```

---

## PLAYER Navigation

```text
Reservaciones

Mi Perfil

Cambiar Club
Explorar Clubes
Salir
```

---

# Validation Gate 1.0

Current validation focus:

* Owner onboarding
* Club discovery
* Club identity
* Reservation requests
* Reservation approvals
* Court management
* Player management

Recent learnings:

* Owners care about club identity
* Branding improves onboarding perception
* Public club pages increase product clarity
* Availability-first experiences are easier for players
* Reservation approval workflows are required by many clubs

---

# MVP Scope Guardrails

Current priorities:

1. Owner onboarding
2. Reservation workflows
3. Courts
4. Players
5. Club identity
6. Club discovery
7. Operational analytics

Deferred:

* Rankings
* Tournaments
* Clinics
* Payments
* Mobile apps
* Community features

When priorities conflict:

Owner value and operational simplicity take precedence.
