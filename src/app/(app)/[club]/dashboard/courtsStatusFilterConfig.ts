// Plain config + pure logic — deliberately NOT a "use client" module, same
// reasoning as dashboardTabsConfig.ts: page.tsx (Server Component) needs to
// resolve the filter itself to run the right query, and the client
// selector needs the exact same option list/labels — one source, never two.

export type CourtsStatusFilter = "active" | "inactive";

export const COURTS_STATUS_OPTIONS: { key: CourtsStatusFilter; label: string }[] = [
  { key: "active", label: "Activas" },
  { key: "inactive", label: "Inactivas" },
];

// Missing, invalid, or any other value than the two real options normalizes
// to "active" — never an error, never a mixed/unfiltered list.
export function resolveCourtsStatusFilter(raw: string | undefined): CourtsStatusFilter {
  return raw === "inactive" ? "inactive" : "active";
}
