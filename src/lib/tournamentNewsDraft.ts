import { tournamentCategoryLabel } from "@/lib/tournamentLabels";
import type { TournamentAwardPair, TournamentAwardSummary } from "@/lib/tournamentAwards";
import type { Tournament } from "@/types/database";

export interface TournamentNewsDraft {
  title: string;
  content: string;
}

const MONTH = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatTournamentDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getDate()} de ${MONTH[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatPairNames(pair: TournamentAwardPair): string {
  return pair.players.map((p) => p.name).join(" y ");
}

function formatGroupNames(pairs: TournamentAwardPair[]): string {
  return pairs.map(formatPairNames).join("; ");
}

// Bloque 2.7 — el borrador de la noticia se deriva exclusivamente de
// TournamentAwardSummary (ya calculado por getTournamentPointsSummary, que
// a su vez es la única lectura autorizada del ledger) y de los campos
// propios del torneo. Nunca recalcula puntos, nunca vuelve a consultar el
// bracket ni el ledger, nunca inventa marcador/MVP/asistentes/estadísticas
// que el producto no rastrea. Cada línea de resultado se omite por
// completo si ese grupo no tiene ninguna pareja (nunca un placeholder
// inventado) — cubre de forma segura el caso defensivo de un resumen
// incompleto (`hasIncompletePairs`).
export function buildTournamentNewsDraft(
  tournament: Pick<Tournament, "name" | "category" | "secondary_category" | "completed_at">,
  summary: TournamentAwardSummary
): TournamentNewsDraft {
  const categoryLabel = tournamentCategoryLabel(tournament.category, tournament.secondary_category);
  const date = formatTournamentDate(tournament.completed_at);

  const champions = summary.pairs.filter((p) => p.placement === "champion");
  const runnerUps = summary.pairs.filter((p) => p.placement === "runner_up");
  const semifinalists = summary.pairs.filter((p) => p.placement === "semifinalist");

  const lines: string[] = [`El torneo ${tournament.name} ha finalizado.`, "", `Categoría: ${categoryLabel}`];
  if (date) lines.push(`Fecha: ${date}`);
  lines.push("");

  if (champions.length > 0) lines.push(`Campeones: ${formatGroupNames(champions)}`);
  if (runnerUps.length > 0) lines.push(`Subcampeones: ${formatGroupNames(runnerUps)}`);
  if (semifinalists.length > 0) lines.push(`Semifinalistas: ${formatGroupNames(semifinalists)}`);

  lines.push("", "¡Gracias a todas las parejas que participaron en este torneo!");

  return {
    title: `${tournament.name} finalizado`,
    content: lines.join("\n"),
  };
}
