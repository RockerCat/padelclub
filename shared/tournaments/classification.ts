import type { TournamentEntryWithMembers, TournamentClassificationRow } from "./entries";

// Extraído de ClassificationSection.tsx (app web) — el fallback real es
// "Jugador" (nunca "Sin nombre", que era lo que mobile tenía antes: una
// reconstrucción a mano que divergía del texto real de WEB).
export function pairLabel(entry: Pick<TournamentEntryWithMembers, "members">): string {
  return entry.members.map((m) => m.full_name ?? "Jugador").join(" / ");
}

// Extraído de TournamentPodium.tsx (app web) — agrupa `rows` por
// `row.position` (nunca por índice) en un Map de a lo más 3 entradas
// (1/2/3). Con un empate real en cualquier posición, todas las duplas de
// esa posición comparten la misma entrada del Map, apiladas — nunca se
// fabrica un ganador único ni una posición inventada. Puramente la regla
// de agrupamiento; el layout/pedestales/scroll siguen siendo de cada
// plataforma (React/React Native), no se comparten.
export function groupPodiumByPlace(
  rows: TournamentClassificationRow[]
): Map<1 | 2 | 3, TournamentClassificationRow[]> {
  const byPlace = new Map<1 | 2 | 3, TournamentClassificationRow[]>();
  for (const row of rows) {
    if (row.position < 1 || row.position > 3) continue;
    const place = row.position as 1 | 2 | 3;
    const list = byPlace.get(place) ?? [];
    list.push(row);
    byPlace.set(place, list);
  }
  return byPlace;
}
