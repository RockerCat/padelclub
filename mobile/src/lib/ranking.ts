import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { SportCategoryRow } from "./players";

// Derivación de podio/empates/fila propia y mensaje de WhatsApp — misma
// fuente que ahora también usa RankingView.tsx (app web), nunca una
// segunda regla. Ver shared/players/ranking.ts.
export * from "../../../shared/players/ranking";
import type { RankingRow } from "../../../shared/players/ranking";

// Categoría inicial: (1) la propia del miembro autenticado si tiene
// sport_state; (2) si no, la predeterminada del club; (3) si tampoco, la
// primera del catálogo por sort_order. Mismo orden exacto de
// src/app/(app)/[club]/ranking/page.tsx (app web) — nunca un valor fijo.
export async function getInitialRankingCategory(
  supabase: SupabaseClient<Database>,
  clubId: string,
  clubMemberId: string | null,
  categories: SportCategoryRow[]
): Promise<string | null> {
  if (clubMemberId) {
    const { data: ownState } = await supabase.rpc("get_club_member_sport_state", {
      p_club_id: clubId,
      p_club_member_id: clubMemberId,
    });
    if (ownState && ownState.length > 0) return ownState[0].category;
  }

  const { data: club } = await supabase.from("clubs").select("default_player_category").eq("id", clubId).single();
  if (club?.default_player_category) return club.default_player_category;

  if (categories.length > 0) return categories[0].code;
  return null;
}

// Misma RPC exacta que RankingView.tsx (app web) usa tanto para el primer
// render como al cambiar de categoría — get_club_category_ranking_view,
// ya autorizada para cualquier miembro activo del club, cualquier rol.
export async function getCategoryRanking(
  supabase: SupabaseClient<Database>,
  clubId: string,
  category: string
): Promise<{ rows: RankingRow[]; error: boolean }> {
  const { data, error } = await supabase.rpc("get_club_category_ranking_view", {
    p_club_id: clubId,
    p_category: category,
  });
  if (error) {
    console.error("[ranking] get_club_category_ranking_view failed:", error);
    return { rows: [], error: true };
  }
  return { rows: (data ?? []) as RankingRow[], error: false };
}
