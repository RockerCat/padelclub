# PadelClub — Development Roadmap

> MVP focus: replace WhatsApp + manual court scheduling for a real padel club.
> Build only what is necessary to validate adoption.
> Last updated: 2026-06-13 (Validation Gate 1.0)

---

## Development Philosophy

PadelClub will not be built feature-complete before validating with real clubs.

The objective is to solve a real operational problem:

- Court reservations
- Club administration
- Player management

Only after proving real-world adoption should additional modules be developed.

Features such as:

- Rankings
- Tournaments
- Clinics
- Community features

are valuable, but only after reservation workflows have been validated.

---

## MVP Success Definition

A real club can replace:

- WhatsApp reservation coordination
- Manual court scheduling
- Reservation spreadsheets

with PadelClub for at least:

**30 consecutive days**

without requiring external tools.

---

## Current Status

### Completed

#### Sprint 0 — Infrastructure & Foundations

Completed.

#### Sprint 1 — Auth + Multi-Tenant + Clubs + Branding

Completed.

#### Sprint 2 — Courts & Players

Completed.

#### Sprint 3.0 — Reservations Core

Completed.

Delivered:

- Reservations
- Reservation players
- Weekly calendar
- Overlap prevention
- Admin reservation management
- Player reservation visibility

#### Sprint 3.1 — Reservation Management

Completed.

Delivered:

- Edit reservations
- Reschedule reservations
- Cancel reservations
- Success banners
- Confirmation dialogs
- Improved reservation actions

#### Sprint 3.2 — Operating Hours

Completed.

Delivered:

- Club operating hours
- Closed days
- Operating hours configuration
- Server-side validation
- Calendar awareness

#### Sprint 3.3 — Reservation UX

Completed.

Delivered:

- Modal reservation workflows
- Smart slot picker
- Today highlighting
- Past reservation prevention
- Improved reservation experience

#### Dashboard 1.1

Completed.

Delivered:

- Reservations this week
- Reserved hours
- Weekly occupancy
- Active players
- Court occupancy
- Peak reservation hour
- Cancellation rate
- Previous week comparison

---

## Current Phase

# Validation Gate 1.0

The system is now feature-complete enough to validate with real clubs.

The goal is no longer feature development.

The goal is learning.

---

## Validation Gate 1.0

### Objective

Confirm that a real club can operate daily reservation workflows using PadelClub.

---

### Success Criteria

All criteria should be met before significant new modules are built.

#### Club Setup

- [ ] Real club created
- [ ] Courts configured
- [ ] Players invited

#### Reservations

- [ ] Reservations created successfully
- [ ] Reservations edited successfully
- [ ] Reservations cancelled successfully
- [ ] Operating hours respected
- [ ] Calendar understood without training

#### Adoption

- [ ] Reduced WhatsApp coordination
- [ ] Used for at least 7 consecutive days
- [ ] Owner feedback collected
- [ ] Admin feedback collected

#### Satisfaction

- [ ] No critical usability blockers
- [ ] No major permission issues
- [ ] No major workflow confusion

---

### Validation Findings Already Resolved

The following issues were discovered and fixed during Validation Gate:

#### Routing

- OWNER incorrect landing page
- ADMIN placeholder landing page
- PLAYER placeholder landing page

#### Permissions

- Staff appearing in player selector

#### Reservations

- Reservations allowed in the past
- Missing operating-hours awareness
- Missing slot guidance
- Excessive page navigation

#### UX

- Calendar now highlights today
- Reservation create/edit moved to modal workflows
- Smart slot picker added

---

### Currently Under Evaluation

#### Player Experience

Questions still being validated:

- Should players see reservation details?
- Should players see only availability?
- Should players create requests instead of reservations?
- What information is useful to players?

#### Reservation Rules

Questions still being validated:

- Allowed reservation durations
- Club-specific reservation policies
- Future pricing rules

#### Analytics

Questions still being validated:

- Which metrics owners actually use?
- Which metrics drive decisions?
- Which metrics are unnecessary?

---

## Next Decision Point

After Validation Gate concludes:

Choose one of the following paths.

### Option A — Player Reservation Requests

Potential Sprint 4.

Deliver:

- Reservation requests
- Approval workflow
- Availability-first player experience

This is currently the most likely next step.

---

### Option B — Club Analytics Expansion

Potential Sprint 4.

Deliver:

- Occupancy trends
- Revenue tracking
- Court utilization reports
- Activity insights

Only if owners request it.

---

### Option C — Tournaments

Potential Sprint 4.

Deliver:

- Tournament creation
- Brackets
- Match results

Only if validated clubs explicitly request tournaments.

---

### Option D — Rankings

Potential Sprint 4 or 5.

Deliver:

- Automatic rankings
- Points system
- Ranking tables

Only after tournament requirements are understood.

---

## Deferred Modules

These modules are intentionally deferred until after Validation Gate.

### Rankings

Status:

Deferred.

Dependency:

Tournament validation.

---

### Tournaments

Status:

Deferred.

Dependency:

Reservation workflow adoption.

---

### Clinics

Status:

Deferred.

Dependency:

Owner demand.

---

### Payments

Status:

Deferred.

Dependency:

Business model validation.

---

### Mobile Applications

Status:

Deferred.

Dependency:

Web product validation.

---

### Community Features

Status:

Deferred.

Dependency:

Proven club adoption.

---

## Post-MVP Roadmap

Potential future initiatives:

- Open matches
- Find players
- Waitlists
- Memberships
- Push notifications
- Mobile applications
- Advanced analytics
- Subdomain routing
- Online payments

None are part of the current MVP.

---

## Definition of Done

A feature is complete when:

1. TypeScript compiles successfully.
2. RLS policies exist and are tested.
3. Mobile layout is validated.
4. Desktop layout is validated.
5. Loading states are implemented.
6. Error states are implemented.
7. No production console errors remain.
8. Code review completed.
9. Merged into main branch.

---

## Current Product Priority Order

When priorities conflict:

1. Reservations
2. Courts
3. Players
4. Club administration
5. Operational analytics
6. Rankings
7. Tournaments
8. Clinics
9. Community features

The owner experience and reservation workflow always take precedence.