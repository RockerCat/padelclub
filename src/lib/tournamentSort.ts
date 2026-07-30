import type { Tournament } from "@/types/database";

// Shared by the OWNER/ADMIN list (Bloque 2.1) and the PLAYER list (Bloque
// 2.2) — same deterministic order, never two versions of the same rule.
// draft/registration_open/registration_closed/in_progress
// ("operational or upcoming") sort first by starts_at ascending (nulls last,
// tie-broken by most-recently-created); completed/cancelled ("historical")
// sort after, by starts_at descending (most recent first).
function isHistorical(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

export function compareTournaments(a: Tournament, b: Tournament): number {
  const aHist = isHistorical(a.status);
  const bHist = isHistorical(b.status);
  if (aHist !== bHist) return aHist ? 1 : -1;

  if (!a.starts_at && !b.starts_at) return b.created_at.localeCompare(a.created_at);
  if (!a.starts_at) return 1;
  if (!b.starts_at) return -1;
  return aHist ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at);
}
