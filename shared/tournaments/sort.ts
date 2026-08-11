import type { Tournament } from "../types/domain";

// Portado de src/lib/tournamentSort.ts (app web) — mismo orden
// determinístico usado por el listado OWNER/ADMIN y el de PLAYER, nunca
// dos versiones de la misma regla. draft/registration_open/
// registration_closed/in_progress ("operativos o próximos") ordenan
// primero por starts_at ascendente (nulls al final, desempate por más
// reciente creado); completed/cancelled ("históricos") ordenan después,
// por starts_at descendente (más reciente primero).
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
