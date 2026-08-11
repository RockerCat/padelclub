import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de page.tsx + MembersClient.tsx
// (src/app/(app)/[club]/admin/players/) — mismas queries exactas: mismo
// club_members select, mismo get_club_category_ranking_view por categoría
// (nunca N+1 por jugador), mismo get_club_member_sport_state para
// inactivos sin estado en el ranking view.

export type MemberRow = {
  id: string;
  club_id: string;
  profile_id: string;
  role: "OWNER" | "ADMIN" | "PLAYER";
  is_active: boolean;
  joined_at: string;
  profiles: { full_name: string | null; avatar_url: string | null; phone: string | null } | null;
};

export type SportCategoryRow = { code: string; sort_order: number };
export type MemberSportState = { category: string; position: number | null; points: number | null };
export type PlayersStatusFilter = "active" | "inactive" | "all";

export const PLAYERS_STATUS_OPTIONS: { value: PlayersStatusFilter; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
  { value: "all", label: "Todos" },
];

export const PLAYERS_CATEGORY_ALL = "all";

export async function getClubMembers(
  supabase: SupabaseClient<Database>,
  clubId: string,
  statusFilter: PlayersStatusFilter
): Promise<MemberRow[]> {
  let query = supabase
    .from("club_members")
    .select("id, club_id, profile_id, role, is_active, joined_at, profiles(full_name, avatar_url, phone)")
    .eq("club_id", clubId)
    .eq("role", "PLAYER");
  if (statusFilter !== "all") query = query.eq("is_active", statusFilter === "active");
  const { data } = await query.order("joined_at", { ascending: false });
  return (data ?? []) as unknown as MemberRow[];
}

// Lookup de un único miembro por id — usado por Torneos (avatar de dupla
// → "Miembro del club") para reutilizar PlayerDetailSheet sin cargar el
// listado completo de Jugadores. Mismo patrón que el bloque de inactivos
// arriba (get_club_member_sport_state directo, position: null — no se
// resuelve el ranking_position exacto, mismo trade-off ya aceptado en ese
// bloque para no encadenar una segunda llamada por miembro).
export async function getMemberById(
  supabase: SupabaseClient<Database>,
  clubId: string,
  clubMemberId: string
): Promise<{ member: MemberRow; sportState: MemberSportState | undefined } | null> {
  const { data: member } = await supabase
    .from("club_members")
    .select("id, club_id, profile_id, role, is_active, joined_at, profiles(full_name, avatar_url, phone)")
    .eq("id", clubMemberId)
    .single();
  if (!member) return null;

  const { data: stateRows } = await supabase.rpc("get_club_member_sport_state", { p_club_id: clubId, p_club_member_id: clubMemberId });
  const row = stateRows?.[0];
  const sportState: MemberSportState | undefined = row?.category
    ? { category: row.category, position: null, points: row.current_points }
    : undefined;

  return { member: member as unknown as MemberRow, sportState };
}

export async function getSportCategories(supabase: SupabaseClient<Database>): Promise<SportCategoryRow[]> {
  const { data } = await supabase.from("sport_categories").select("code, sort_order").order("sort_order", { ascending: true });
  return (data ?? []) as SportCategoryRow[];
}

export async function getSportStateByMember(
  supabase: SupabaseClient<Database>,
  clubId: string,
  categories: SportCategoryRow[],
  members: MemberRow[],
  statusFilter: PlayersStatusFilter
): Promise<Record<string, MemberSportState>> {
  const rankingByCategory = await Promise.all(
    categories.map((c) => supabase.rpc("get_club_category_ranking_view", { p_club_id: clubId, p_category: c.code }))
  );

  const sportStateByMember: Record<string, MemberSportState> = {};
  for (const { data: rankingRows, error } of rankingByCategory) {
    if (error || !rankingRows) continue;
    for (const row of rankingRows) {
      sportStateByMember[row.club_member_id] = {
        category: row.category,
        position: row.ranking_position,
        points: row.current_points,
      };
    }
  }

  // get_club_category_ranking_view solo lista miembros PLAYER activos —
  // para inactivos (cuando el filtro de estado los incluye) se resuelve su
  // categoría vigente aparte, igual que en la web, acotado solo a esos.
  if (statusFilter !== "active") {
    const inactiveMembers = members.filter((m) => !m.is_active && !sportStateByMember[m.id]);
    if (inactiveMembers.length > 0) {
      const inactiveStates = await Promise.all(
        inactiveMembers.map((m) => supabase.rpc("get_club_member_sport_state", { p_club_id: clubId, p_club_member_id: m.id }))
      );
      inactiveMembers.forEach((m, i) => {
        const row = inactiveStates[i].data?.[0];
        if (row?.category) {
          sportStateByMember[m.id] = { category: row.category, position: null, points: row.current_points };
        }
      });
    }
  }

  return sportStateByMember;
}
