import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { Tournament } from "../types/domain";
import { compareTournaments } from "../../../shared/tournaments/sort";

// La mayor parte de este archivo ya NO es una copia — Metro ahora
// resuelve shared/ fuera de la raíz de mobile/ (ver mobile/metro.config.js,
// watchFolders). Labels/orden/duración/tabs/errores/validación/RPCs de
// torneo/transiciones de ciclo de vida/mensaje de WhatsApp viven en
// shared/tournaments/{labels,sort,duration,tabs,actions}.ts, la misma
// fuente que la app web ahora también usa (antes había hasta 3 copias
// del mismo cálculo: la de WEB embebida inline en componentes nunca
// exportada, y esta, reconstruida a mano). Solo getTournamentsForClub
// (la consulta de listado, específica de esta pantalla) se queda aquí —
// no tiene un equivalente exportado en WEB para reutilizar (su
// Server Component arma la misma consulta inline).
export * from "../../../shared/tournaments/labels";
export * from "../../../shared/tournaments/sort";
export * from "../../../shared/tournaments/duration";
export * from "../../../shared/tournaments/tabs";
export * from "../../../shared/tournaments/actions";
export { pairLabel, groupPodiumByPlace } from "../../../shared/tournaments/classification";

export type SportCategoryOption = { code: string; sort_order: number };

// Portado de la query de src/app/(app)/[club]/admin/tournaments/page.tsx —
// mismas 3 consultas exactas, mismo conteo agregado en JS (PostgREST no
// ofrece GROUP BY), mismo compareTournaments para el orden final.
export async function getTournamentsForClub(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<{
  tournaments: Tournament[];
  confirmedCountByTournamentId: Record<string, number>;
  categories: SportCategoryOption[];
}> {
  const [{ data: tournaments }, { data: confirmedEntries }, { data: sportCategories }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("club_id", clubId),
    supabase.from("tournament_entries").select("tournament_id").eq("club_id", clubId).eq("status", "confirmed"),
    supabase.from("sport_categories").select("code, sort_order, created_at").order("sort_order", { ascending: true }),
  ]);

  const tournamentList = [...(tournaments ?? [])].sort(compareTournaments);

  const confirmedCountByTournamentId: Record<string, number> = {};
  for (const row of confirmedEntries ?? []) {
    confirmedCountByTournamentId[row.tournament_id] = (confirmedCountByTournamentId[row.tournament_id] ?? 0) + 1;
  }

  return { tournaments: tournamentList, confirmedCountByTournamentId, categories: sportCategories ?? [] };
}
