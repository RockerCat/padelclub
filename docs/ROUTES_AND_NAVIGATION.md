# PadelClub — Routes & Navigation

> Source of truth for routing, navigation and role-based access.
> Last updated: 2026-06-13 (rev 3 — Sprint 3.3 complete, Dashboard 1.1, Operating Hours, Validation Gate 1.0)

---

## Route Groups Overview

| Group | Path Prefix | Description | Auth Required |
|---|---|---|---|
| `(marketing)` | `/` | Public marketing website | No |
| `auth` | `/auth/...` | Authentication flows | No |
| `onboarding` | `/onboarding` | First club creation flow | Yes |
| `clubs` | `/clubs` | Club selection and club creation | Yes |
| `(app)` | `/[club]/...` | Authenticated club experience | Yes |

---

## Routing Principles

### Multi-Tenant Routing

All club functionality is scoped under:

```text
/[club]/*
```

Examples:

```text
/alex-club-padel/dashboard
/alex-club-padel/admin/reservations
/alex-club-padel/reservations
```

The club slug is the tenant identifier.

### Role-Aware Navigation

Navigation is determined by:

- authenticated user
- selected club
- membership role

Supported roles:

- OWNER
- ADMIN
- PLAYER

### Canonical Entry Function

All role-based redirects should use:

```typescript
getClubEntryPath(slug, role)
```

Expected behavior:

```text
OWNER  → /{slug}/dashboard
ADMIN  → /{slug}/admin/reservations
PLAYER → /{slug}/reservations
```

Hardcoded role redirects should be avoided.

---

## Club Management Routes

### Onboarding

```text
/onboarding
```

Purpose:

Create first club.

Behavior:

```text
0 clubs  → show onboarding
1+ clubs → redirect /clubs
```

### Club Selector

```text
/clubs
```

Purpose:

Select active club.

Behavior:

```text
0 clubs  → /onboarding
1+ clubs → show selector
```

Important:

Direct navigation to `/clubs` always shows the selector.

Automatic redirects only happen immediately after login.

### Create Additional Club

```text
/clubs/create
```

Creates:

- club
- OWNER membership

Redirect:

```text
/{slug}/dashboard
```

---

## Authenticated Club Routes

### Club Root

```text
/[club]
```

Purpose:

Role-aware entry route.

Behavior:

```text
OWNER  → /[club]/dashboard
ADMIN  → /[club]/admin/reservations
PLAYER → /[club]/reservations
```

No user-facing content should exist here.

This route only performs role-aware redirects.

---

## OWNER Routes

### Dashboard

```text
/[club]/dashboard
```

Role:

OWNER only.

Purpose:

Operational visibility.

Current metrics:

- Reservations this week
- Reserved hours
- Weekly occupancy
- Active players
- Court occupancy
- Peak reservation hour
- Cancellation rate
- Previous week comparison

---

## Shared Member Routes

Accessible to:

- OWNER
- ADMIN
- PLAYER

### Reservations

```text
/[club]/reservations
```

Current implementation:

- Reservation visibility
- Reservation calendar

Future iterations may evolve this experience toward:

- Availability-first workflows
- Reservation requests

### Profile

```text
/[club]/profile
```

Purpose:

Personal profile and preferences.

---

## Admin Routes

Accessible to:

- OWNER
- ADMIN

Blocked for:

- PLAYER

### Admin Root

```text
/[club]/admin
```

Redirects to:

```text
/[club]/admin/reservations
```

### Reservations

```text
/[club]/admin/reservations
```

Primary operational screen.

Current functionality:

- Weekly calendar
- Create reservation
- Edit reservation
- Cancel reservation
- Smart slot picker
- Operating hours validation
- Modal workflows

### Courts

```text
/[club]/admin/courts
```

Current functionality:

- Create court
- Edit court
- Activate court
- Deactivate court

### Players

```text
/[club]/admin/players
```

Current functionality:

- View members
- Invite players
- Invite admins
- Manage memberships

Important:

There is no dedicated `players` table.

Players are:

```text
club_members.role = 'PLAYER'
```

### Settings

```text
/[club]/admin/settings
```

Role:

OWNER only.

Current functionality:

- Club information
- Branding
- Operating hours

ADMIN cannot access this route.

---

## Permission Matrix

| Route | OWNER | ADMIN | PLAYER |
|---|:---:|:---:|:---:|
| `/[club]` | ✓ | ✓ | ✓ |
| `/[club]/dashboard` | ✓ | — | — |
| `/[club]/reservations` | ✓ | ✓ | ✓ |
| `/[club]/profile` | ✓ | ✓ | ✓ |
| `/[club]/admin` | ✓ | ✓ | — |
| `/[club]/admin/reservations` | ✓ | ✓ | — |
| `/[club]/admin/courts` | ✓ | ✓ | — |
| `/[club]/admin/players` | ✓ | ✓ | — |
| `/[club]/admin/settings` | ✓ | — | — |

---

## Navigation Architecture

### OWNER Navigation

```text
Dashboard
Reservaciones

Administración
├─ Canchas
├─ Jugadores
└─ Configuración

Mi Perfil
Cambiar Club
Crear Club
Salir
```

### ADMIN Navigation

```text
Reservaciones

Administración
├─ Canchas
└─ Jugadores

Mi Perfil
Cambiar Club
Salir
```

### PLAYER Navigation

```text
Reservaciones

Mi Perfil
Cambiar Club
Salir
```

---

## Validation Gate 1.0

Current focus:

- Validate OWNER workflows
- Validate ADMIN workflows
- Refine PLAYER experience
- Remove friction
- Verify permissions

Recent fixes:

- OWNER landing page
- ADMIN landing page
- PLAYER landing page
- Staff excluded from player selector
- Past reservations blocked
- Today highlighted in calendar
- Modal-based reservation workflows

---

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