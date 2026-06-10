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

## Official Logo Assets

/assets/branding/logo-primary.png

/assets/branding/logo-icon.png

# Product Strategy

## Primary Customer

### Club Owner

The club owner is the primary customer.

Club owners:

- Make adoption decisions
- Control budgets
- Can enforce platform usage
- Benefit from operational visibility

When there is uncertainty between owner value and player value:

**Prioritize owner value.**

## Secondary Users

### Club Administrator

Responsible for daily operations.

Needs:

- Reservation management
- Tournament management
- Clinic management
- Match result registration

The administrator experience must be extremely simple.

### Players

Consume the experience.

Needs:

- Rankings
- Tournaments
- Clinics
- Reservations
- Club information

Players are important but are not the primary customer.

# Core Product Principles

## Principle 1: Eliminate Work

PadelClub should remove work.

Never create additional work.

Before building a feature ask:

- Does this reduce manual effort?
- Does this reduce WhatsApp dependency?
- Does this eliminate Excel usage?
- Does this improve visibility?

If not, reconsider the feature.

## Principle 2: Do Not Depend On Administrative Discipline

The platform must work even when administrators are busy.

### Bad

- Manual ranking updates
- Manual statistics maintenance
- Manual calculations

### Good

- Register result
- Ranking updates automatically
- Statistics update automatically

Automation is preferred whenever possible.

## Principle 3: Simplicity Over Features

Many club administrators are not highly technical.

Every workflow should feel approachable to someone currently using:

- WhatsApp
- Excel
- Paper notebooks

If a feature requires training, it is probably too complex.

## Principle 4: Mobile First

Assume most users access the platform from mobile devices.

All workflows should be designed mobile-first.

Desktop support is important but secondary.

## Principle 5: Real Adoption Over Feature Count

Success is measured by real club adoption.

Not by:

- Number of screens
- Number of features
- Technical complexity

A simple feature used daily is more valuable than an advanced feature nobody uses.

# Multi-Tenant Architecture

## Platform

PadelClub is the platform.

## Tenants

Each club is a tenant.

Examples:

- Platino Pádel
- Pádel Duitama
- Club XYZ

Club data must always remain isolated.

Each club owns:

- Players
- Reservations
- Tournaments
- Rankings
- Clinics
- Statistics
- Branding

# Club Branding

## Branding Is A Core MVP Feature

Each club must be able to configure:

- Club name
- Logo
- Primary color
- Secondary color
- Description
- WhatsApp
- Facebook
- Instagram
- YouTube channel

Players should feel they are inside the club's own portal.

PadelClub remains the underlying platform.

### Example URLs

- platino.padelclub.co
- padelclub.co/clubs/platino-padel

# MVP Scope

## Owner Dashboard

Provide visibility into club operations.

### Metrics

- Reservations this week
- Reservations this month
- Court occupancy
- Active players
- New players
- Upcoming tournaments
- Recent activity
- Ranking status

### Goal

Allow owners to understand what is happening inside their club.

## Reservations

### Administrator

- Create reservation
- Edit reservation
- Cancel reservation

### Player

- View availability
- View calendar
- Request reservation

## Tournaments

### Administrator

- Create tournament
- Manage participants
- Generate brackets
- Register results

### System

- Update rankings automatically
- Update statistics automatically

### Player

- View tournaments
- Register for tournaments
- View results
- View standings

## Clinics

### Administrator

- Create clinic
- Assign instructor
- Define capacity
- Manage participants

### Player

- View clinics
- Register for clinics

## Rankings

Rankings must be generated automatically.

Manual ranking maintenance should not exist.

Rankings are a consequence of tournament activity.

The platform should eliminate Excel-based ranking management.

## Player Profiles

Players should be able to view:

- Ranking position
- Tournament participation
- Match history
- Basic statistics

# Future Features

## Potential Roadmap

- Open matches
- Find players
- Matchmaking
- Complete missing players
- Advanced statistics
- Achievements
- Memberships
- Notifications
- Online payments
- Mobile applications
- Streaming integrations

Do not prioritize these features until the MVP has been validated with real clubs.

# Out Of Scope

## Excluded Features

- POS systems
- Inventory management
- Billing systems
- E-commerce
- Marketplace functionality
- Internal chat
- Social network features

Maintain focus.

# Design Philosophy

## Desired Experience

The platform should feel:

- Modern
- Friendly
- Professional
- Community-driven

## Avoid

- Enterprise software aesthetics
- Overly technical workflows
- Complex navigation

## Prefer

- Clear actions
- Large touch targets
- Simple forms
- Fast workflows

# Branding

## Product Name

PadelClub

## Brand Positioning

PadelClub is the platform.

The club is the hero.

The platform empowers clubs to create their own digital presence.

## Visual Identity

Primary colors:

- Dark Blue
- Court Blue
- Lime Green
- White

## Logo

Approved logo concept:

- Circular mark
- Court-inspired geometry
- References to padel court walls
- Simple
- Modern
- Scalable
- Works as favicon and app icon

# Validation Strategy

## Initial Goal

Focus on one real club first.

The goal is not scale.

The goal is adoption.

## Success Path

1. One club adopts the platform.
2. One administrator uses it consistently.
3. One owner sees operational value.
4. Players engage with rankings and tournaments.
5. Learn from real usage.
6. Iterate.

# Success Metrics

## MVP Success Definition

The MVP succeeds if a real club can replace:

- WhatsApp reservation coordination
- Excel ranking management
- Manual tournament tracking

with PadelClub for at least 30 consecutive days.

Real usage is more important than registrations.

Operational adoption is more important than feature count.