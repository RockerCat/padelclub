import { pairLabel } from "@/components/tournaments/ClassificationSection";
import { tournamentCategoryLabel } from "@/lib/tournamentLabels";
import type { TournamentClassificationRow } from "@/lib/tournamentEntries";
import type { Tournament } from "@/types/database";

export interface TournamentNewsDraft {
  title: string;
  content: string;
}

// Prellenado editorial para "Generar noticia" desde un torneo completed —
// título y contenido son solo un punto de partida: el organizador puede
// editar cualquier texto antes de publicar, exactamente igual que
// cualquier otra noticia (NewsForm ya lo permite sin cambios). Esta
// función nunca construye ni envía la asociación con el torneo — eso
// viaja aparte, como argumento del server action (ver CreateNewsModal/
// createNews), nunca como parte del texto editable.
export function buildTournamentNewsDraft(
  tournament: Pick<Tournament, "name" | "category" | "secondary_category">,
  classification: TournamentClassificationRow[]
): TournamentNewsDraft {
  const podium = classification.filter((row) => row.position <= 3);
  const champions = podium.filter((row) => row.position === 1);
  const runnersUp = podium.filter((row) => row.position === 2);
  const thirdPlace = podium.filter((row) => row.position === 3);

  const categoryLabel = tournamentCategoryLabel(tournament.category, tournament.secondary_category);

  const title =
    champions.length > 0
      ? `${champions.map((row) => pairLabel(row.entry)).join(" y ")} se coronan en ${tournament.name}`
      : `${tournament.name} llegó a su fin`;

  const lines: string[] = [`El torneo "${tournament.name}" (categoría ${categoryLabel}) llegó a su fin en el club.`];

  if (champions.length > 0) {
    lines.push(`🥇 Campeones: ${champions.map((row) => pairLabel(row.entry)).join(" y ")}.`);
  }
  if (runnersUp.length > 0) {
    lines.push(`🥈 Subcampeones: ${runnersUp.map((row) => pairLabel(row.entry)).join(" y ")}.`);
  }
  if (thirdPlace.length > 0) {
    lines.push(`🥉 Tercer lugar: ${thirdPlace.map((row) => pairLabel(row.entry)).join(" y ")}.`);
  }

  lines.push("¡Felicitaciones a todas las duplas por un gran torneo!");

  return { title, content: lines.join("\n\n") };
}
