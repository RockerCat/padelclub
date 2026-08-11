import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export type TournamentCandidate = {
  club_member_id: string;
  full_name: string | null;
  avatar_url: string | null;
  category: string;
};

// Extraído de RegisterEntryModal.tsx y ReplaceMemberModal.tsx (app web) —
// antes vivía copiado literal en AMBOS componentes (mismo bloque de
// carga, palabra por palabra) además de portado a mano una tercera vez en
// mobile. Ahora es la única fuente: una llamada a
// get_club_category_ranking_view por cada categoría real del torneo (1
// si es simple, 2 si es combinado), nunca una llamada por jugador, con
// dedupe por club_member_id en un Map.
export async function getTournamentCandidates(
  supabase: SupabaseClient<Database>,
  clubId: string,
  categories: string[],
  excludeIds: string[] = []
): Promise<{ candidates: TournamentCandidate[]; error: string | null }> {
  const uniqueCategories = [...new Set(categories)];
  const results = await Promise.all(
    uniqueCategories.map((cat) => supabase.rpc("get_club_category_ranking_view", { p_club_id: clubId, p_category: cat }))
  );

  // Mismo chequeo que el bloque inline original de RegisterEntryModal/
  // ReplaceMemberModal (app web) — la copia previa de esta función en
  // mobile no lo tenía (una llamada fallida producía una lista vacía o
  // parcial en silencio, sin avisar al usuario).
  if (results.some((r) => r.error)) {
    return { candidates: [], error: "No se pudo cargar la lista de jugadores." };
  }

  const byId = new Map<string, TournamentCandidate>();
  for (const { data } of results) {
    for (const row of data ?? []) {
      byId.set(row.club_member_id, {
        club_member_id: row.club_member_id,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
        category: row.category,
      });
    }
  }

  const excludeSet = new Set(excludeIds);
  return { candidates: [...byId.values()].filter((c) => !excludeSet.has(c.club_member_id)), error: null };
}

// Extraído de RegisterEntryModal.tsx (app web, función companionCandidates)
// — regla de composición SOLO de UX (el RPC register_tournament_entry
// sigue siendo la autoridad real): expresada puramente vía códigos de
// categoría (nunca sort_order, nunca una suma, nunca comparación de
// strings más allá de igualdad) — "el primer slot" no tiene restricción
// (superior o inferior); una vez que tiene un jugador de la categoría
// PRIMARIA (superior), el slot compañero se acota solo a la SECUNDARIA
// (inferior), reflejando exactamente la regla del backend
// superior+inferior/inferior+superior/inferior+inferior. Para un torneo
// simple (secondaryCategory null), todo candidato ya cargado comparte la
// única categoría, así que no hace falta filtro extra.
export function companionCandidates(
  candidates: TournamentCandidate[],
  firstMemberCategory: string | null,
  primaryCategory: string,
  secondaryCategory: string | null
): TournamentCandidate[] {
  if (!secondaryCategory) return candidates;
  if (firstMemberCategory === primaryCategory) {
    return candidates.filter((c) => c.category === secondaryCategory);
  }
  return candidates;
}
