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

### ADMIN

Administrators focus on daily operations.

Their primary workflows include:

- Reservation management
- Court management
- Player administration

Administrators are operators, not business owners.

Do not assume administrators need access to owner-level insights or configuration.

### PLAYER

Players are secondary users.

Players primarily care about:

- Finding available courts
- Making reservations
- Participating in club activities

Players do not need access to most operational information.

Player experiences should focus on action and convenience rather than administration.

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

Operational workflows remain important, but club identity should always be visible.