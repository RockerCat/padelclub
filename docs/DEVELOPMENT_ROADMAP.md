# PadelClub — Development Roadmap

> MVP Focus: Help real padel clubs replace WhatsApp coordination and manual administration.
>
> Build only what is necessary to validate adoption.
>
> Last Updated: June 2026 (Validation Gate 1.0)

---

# Product Strategy

PadelClub will not be built feature-complete before validating with real clubs.

The goal is not to build every possible club-management feature.

The goal is to prove that club owners are willing to operate their clubs using PadelClub as their primary system.

The MVP focuses on solving:

* Club setup
* Club administration
* Court management
* Player management
* Reservation workflows
* Reservation approvals

Everything else is secondary until adoption is validated.

---

# Core Product Thesis

The primary customer is the Club Owner.

Players are important.

Administrators are important.

But the buying decision is made by the Owner.

Every roadmap decision should answer:

> Does this help a club owner operate and grow their club?

If not, it should be deprioritized.

---

# Product Evolution

## Phase 0 — Foundations

Status:

✅ Completed

Delivered:

* Next.js architecture
* Supabase integration
* Authentication
* Multi-tenant model
* Role system
* RLS foundation
* Club membership architecture

Outcome:

Platform foundation established.

---

## Phase 1 — Multi-Club Platform

Status:

✅ Completed

Delivered:

* Club creation
* Club membership
* Club invitations
* Multi-club users
* Role-based navigation
* Club switching

Outcome:

Users can belong to multiple clubs with different roles.

---

## Phase 2 — Operations Core

Status:

✅ Completed

Delivered:

### Courts

* Create courts
* Edit courts
* Activate/deactivate courts

### Players

* Invite players
* Membership management
* Role management

### Administration

* Club settings
* Operating hours
* Closed days

Outcome:

Basic club operations became manageable through the platform.

---

## Phase 3 — Reservation System

Status:

✅ Completed

Delivered:

### Reservation Management

* Create reservations
* Edit reservations
* Cancel reservations
* Weekly calendar

### Availability

* Smart slot selection
* Availability validation
* Overlap prevention
* Court scheduling

### Reservation Policies

* Club operating hours
* Closed days
* Reservation duration validation

### Reservation Requests

* Player reservation requests
* Pending reservations
* Approval workflow
* Rejection workflow

Outcome:

Reservation workflows are now operationally usable.

---

## Phase 4 — Owner Experience & Club Identity

Status:

🚧 In Progress

Objective:

Transform PadelClub from an administration tool into the digital home of a club.

---

### Dashboard Evolution

Delivered:

* Club hero
* Shared branding
* Public/private status
* Club profile visibility
* Owner-focused navigation

In Progress:

* Improved onboarding
* Dashboard refinement
* Club profile editing

---

### Club Identity

Delivered:

* Logo support
* Cover image support
* Club description
* Club visibility

In Progress:

* Direct logo upload
* Direct cover upload
* Club profile enrichment

---

### Club Discovery

Delivered:

* Public club directory
* Club search
* Public club profiles
* Membership awareness

In Progress:

* Private club experience
* Join request UX
* Discovery improvements

---

### Owner Onboarding

Delivered:

* Club creation flow
* Owner dashboard entry point
* Guided onboarding checklist

Current checklist:

1. Personalize public page
2. Add first court
3. Configure operating hours
4. Invite first player
5. Create first reservation

Goal:

Reach operational readiness without assistance.

---

# Validation Gate 1.0

Status:

🚧 Active

---

## Objective

Validate that a real club can operate daily using PadelClub.

The focus is no longer feature development.

The focus is learning.

---

## Success Criteria

### Club Setup

* [ ] Real club created
* [ ] Public profile completed
* [ ] Courts configured
* [ ] Operating hours configured

### Players

* [ ] Players invited
* [ ] Players joined successfully

### Reservations

* [ ] Reservation requests created
* [ ] Requests approved successfully
* [ ] Reservations managed without confusion

### Adoption

* [ ] Reduced WhatsApp coordination
* [ ] Daily usage
* [ ] At least 30 days of real operation

### Satisfaction

* [ ] No major usability blockers
* [ ] No critical workflow confusion
* [ ] Positive owner feedback
* [ ] Positive admin feedback

---

# Current Learning Questions

## Owner Experience

Questions:

* What information should appear on the dashboard?
* Which metrics matter most?
* Which onboarding steps create friction?

---

## Club Discovery

Questions:

* How do players discover clubs?
* Should private clubs appear in search?
* How should membership requests work?

---

## Reservations

Questions:

* Which duration combinations are most common?
* Are approval workflows sufficient?
* Which reservation restrictions are needed?

---

## Analytics

Questions:

* Which metrics owners actually use?
* Which metrics drive decisions?
* Which metrics create noise?

---

# Post-Validation Decision Point

After Validation Gate concludes, choose the next major investment area.

---

## Option A — Owner Analytics

Potential Phase 5

Deliver:

* Occupancy trends
* Court utilization
* Reservation patterns
* Activity insights
* Operational KPIs

Priority:

High

Only if owners actively request analytics.

---

## Option B — Club Growth Tools

Potential Phase 5

Deliver:

* Enhanced club profiles
* Gallery support
* Location support
* Contact information
* Public profile improvements

Priority:

High

Supports club acquisition and visibility.

---

## Option C — Rankings

Potential Phase 6

Deliver:

* Ranking configuration
* Ranking tables
* Ranking visibility controls
* Automated updates

Priority:

Medium

Only after operations are validated.

---

## Option D — Tournaments

Potential Phase 6

Deliver:

* Tournament creation
* Brackets
* Match tracking
* Results

Priority:

Medium

Only if real clubs request tournament support.

---

# Deferred Modules

These modules are intentionally deferred until adoption is validated.

---

## Clinics

Status:

Deferred

Reason:

Not required for MVP validation.

---

## Payments

Status:

Deferred

Reason:

Business model validation comes first.

---

## Mobile Applications

Status:

Deferred

Reason:

Web adoption must be validated first.

---

## Community Features

Status:

Deferred

Reason:

Community is not the primary value proposition.

Owners pay for operations, not community.

---

## Open Matches

Status:

Deferred

Reason:

Requires reservation adoption first.

---

## Find Players

Status:

Deferred

Reason:

Depends on community strategy decisions.

---

# Product Priority Order

When priorities conflict:

1. Owner onboarding
2. Reservation workflows
3. Courts
4. Players
5. Club identity
6. Club discovery
7. Analytics
8. Rankings
9. Tournaments
10. Clinics
11. Community features

---

# Definition of Success

PadelClub reaches MVP validation when:

A real club can:

* Configure itself
* Invite players
* Manage reservations
* Approve requests
* Operate for 30 consecutive days

without relying on:

* WhatsApp coordination
* Manual scheduling
* External spreadsheets

At that point the platform can confidently expand into rankings, tournaments, analytics, and additional club-management features.
