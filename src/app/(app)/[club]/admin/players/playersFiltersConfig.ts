// Plain config + pure logic — no "use client" here, same reasoning as
// dashboardTabsConfig.ts/courtsStatusFilterConfig.ts: page.tsx (Server
// Component) resolves the filters itself to run the right query, and the
// client selector needs the exact same option list/labels — one source.

export type PlayersStatusFilter = "active" | "inactive" | "all";

export const PLAYERS_STATUS_OPTIONS: { value: PlayersStatusFilter; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
  { value: "all", label: "Todos" },
];

// Missing, invalid, or any other value normalizes to "active" — never an
// error, never a mixed active+inactive list on first load.
export function resolvePlayersStatusFilter(raw: string | undefined): PlayersStatusFilter {
  return raw === "inactive" || raw === "all" ? raw : "active";
}

export const PLAYERS_CATEGORY_ALL = "all";

// Validated against the real sport_categories catalog (never a hardcoded
// list) — a code that doesn't exist in this club's catalog normalizes to
// "all" instead of silently matching nothing.
export function resolvePlayersCategoryFilter(raw: string | undefined, validCodes: string[]): string {
  return raw && validCodes.includes(raw) ? raw : PLAYERS_CATEGORY_ALL;
}
