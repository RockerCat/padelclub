// Single source of truth for club slug validation, shared between the
// normal (OWNER) club-creation flow (src/app/onboarding/actions.ts) and
// the SUPERADMIN pending-club creation flow
// (src/app/platform/clubs/create/actions.ts).
//
// Deliberately NOT inside onboarding/actions.ts: that file has
// "use server", and Next.js only allows a "use server" file to export
// async functions — RESERVED_SLUGS (a Set, a plain object) living there
// broke the moment a second caller needed to import it, with "A 'use
// server' file can only export async functions, found object." This file
// has no directive at all, so it can export whatever it needs to.

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

// Top-level static routes — a club with one of these slugs would be
// permanently unreachable at /[slug] (Next.js always resolves the static
// route first), so it's blocked at creation time rather than silently
// producing a dead club.
export const RESERVED_SLUGS = new Set([
  "auth",
  "clubs",
  "platform",
  "onboarding",
  "unauthorized",
  "invite",
  "api",
  "notifications",
  "claim-club",
]);
