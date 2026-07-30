import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TournamentEntryRow, TournamentEntryStatus } from "@/types/database";

export interface TournamentEntryMemberDisplay {
  club_member_id: string;
  profile_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  // Bloque 3.3 — categoría deportiva REAL y vigente de este club_member_id
  // (club_member_sport_state, vía la misma get_club_category_ranking_view
  // ya autorizada que usa Ranking) — nunca entry.category/secondary_category,
  // que solo congelan la modalidad del torneo al momento de la inscripción.
  // Esto importa sobre todo en un torneo combinado: ambos integrantes de
  // una pareja pueden estar en categorías reales distintas (superior +
  // inferior) aunque el entry solo tenga una. null cuando el miembro
  // todavía no tiene estado deportivo aprovisionado — los llamadores caen
  // de vuelta a entry.category en ese caso (ver PairMemberSlot).
  category: string | null;
}

export interface TournamentEntryWithMembers extends TournamentEntryRow {
  // 0-2 items — can be fewer than 2 when RLS hides a member row (a
  // PLAYER's own still-pending entry only ever exposes their own row, not
  // their partner's, see 20260915000001's documented tradeoff). Never
  // padded/guessed — the UI must render the gap explicitly.
  members: TournamentEntryMemberDisplay[];
}

export interface TournamentEntriesCapacity {
  confirmed: number;
  pending: number;
  withdrawn: number;
  rejected: number;
  occupied: number; // confirmed + pending
  total: number; // tournament.max_pairs
}

const STATUS_ORDER: Record<string, number> = { confirmed: 0, pending: 1, withdrawn: 2, rejected: 3 };

// Bloque 3.3 — resuelve la categoría real de cualquier cantidad de
// club_member_id en, como máximo, 2 llamadas (una por cada categoría que
// el torneo acepta: category y, si es combinado, secondary_category) —
// nunca una llamada por jugador/pareja. Mismo patrón ya usado en
// RegisterEntryModal.tsx para el combobox de inscripción. Nunca toca
// club_member_sport_state directamente (RLS-cerrada, sin GRANT a
// cliente) — get_club_category_ranking_view sigue siendo la única vía.
async function resolveMemberCategories(
  supabase: SupabaseClient<Database>,
  clubId: string,
  categories: string[]
): Promise<Map<string, string>> {
  const uniqueCategories = [...new Set(categories)];
  const map = new Map<string, string>();
  if (uniqueCategories.length === 0) return map;

  const results = await Promise.all(
    uniqueCategories.map((cat) => supabase.rpc("get_club_category_ranking_view", { p_club_id: clubId, p_category: cat }))
  );
  for (const { data } of results) {
    for (const row of data ?? []) map.set(row.club_member_id, row.category);
  }
  return map;
}

function compareEntries(a: TournamentEntryWithMembers, b: TournamentEntryWithMembers): number {
  const orderDiff = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
  if (orderDiff !== 0) return orderDiff;
  return a.created_at.localeCompare(b.created_at);
}

// Shared by the OWNER/ADMIN detail page and the PLAYER detail page — same
// rule, same query shape, never two slightly different versions (CLAUDE.md
// → Shared View & Data Patterns). Bloque 3.3 added real per-member category
// resolution (resolveMemberCategories, up to 2 extra RPC calls — one per
// `categories` entry, run in parallel with the two queries below, never one
// per entry/player): (1) tournament_entries, (2) tournament_entry_members,
// (3) club_members+profiles for the distinct member ids found in (2), (4-5)
// get_club_category_ranking_view for each of at most 2 categories — 3 to 5
// total, never per-entry/per-player. RLS applies to (1) and (2) exactly as
// documented in 20260915000001 — this function never widens or narrows
// what each role can see, it only shapes whatever rows the caller's own
// session is already allowed to read.
export async function getTournamentEntriesWithMembers(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  clubId: string,
  // Bloque 3.3 — categorías reales a resolver por miembro: [tournament.category]
  // o [tournament.category, tournament.secondary_category] para un torneo
  // combinado. Nunca más de 2 elementos.
  categories: string[]
): Promise<{ entries: TournamentEntryWithMembers[]; error: string | null }> {
  const [entriesRes, membersRes, categoryByMemberId] = await Promise.all([
    supabase
      .from("tournament_entries")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("club_id", clubId),
    supabase
      .from("tournament_entry_members")
      .select("id, tournament_entry_id, club_member_id")
      .eq("tournament_id", tournamentId)
      .eq("club_id", clubId),
    resolveMemberCategories(supabase, clubId, categories),
  ]);

  if (entriesRes.error || membersRes.error) {
    return { entries: [], error: "No se pudieron cargar las inscripciones." };
  }

  const memberRows = membersRes.data ?? [];
  const memberIds = [...new Set(memberRows.map((m) => m.club_member_id))];

  const displayByMemberId = new Map<string, TournamentEntryMemberDisplay>();
  if (memberIds.length > 0) {
    const { data: clubMembers, error: clubMembersError } = await supabase
      .from("club_members")
      .select("id, profile_id, profiles(full_name, avatar_url)")
      .eq("club_id", clubId)
      .in("id", memberIds);

    if (clubMembersError) {
      return { entries: [], error: "No se pudieron cargar las inscripciones." };
    }

    for (const cm of clubMembers ?? []) {
      const profile = Array.isArray(cm.profiles) ? cm.profiles[0] : cm.profiles;
      displayByMemberId.set(cm.id, {
        club_member_id: cm.id,
        profile_id: cm.profile_id,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        category: categoryByMemberId.get(cm.id) ?? null,
      });
    }
  }

  const membersByEntryId = new Map<string, TournamentEntryMemberDisplay[]>();
  for (const row of memberRows) {
    const list = membersByEntryId.get(row.tournament_entry_id) ?? [];
    const display = displayByMemberId.get(row.club_member_id);
    // Falls back to a placeholder (never a raw UUID) when RLS hid the
    // underlying club_members/profiles row for this specific member.
    list.push(display ?? { club_member_id: row.club_member_id, profile_id: null, full_name: null, avatar_url: null, category: null });
    membersByEntryId.set(row.tournament_entry_id, list);
  }

  const entries: TournamentEntryWithMembers[] = (entriesRes.data ?? []).map((entry) => ({
    ...entry,
    members: membersByEntryId.get(entry.id) ?? [],
  }));

  entries.sort(compareEntries);

  return { entries, error: null };
}

export function summarizeCapacity(entries: TournamentEntryWithMembers[], maxPairs: number): TournamentEntriesCapacity {
  const count = (status: TournamentEntryStatus) => entries.filter((e) => e.status === status).length;
  const confirmed = count("confirmed");
  const pending = count("pending");
  const withdrawn = count("withdrawn");
  const rejected = count("rejected");
  return { confirmed, pending, withdrawn, rejected, occupied: confirmed + pending, total: maxPairs };
}

export interface TournamentClassificationRow {
  entry: TournamentEntryWithMembers;
  position: number;
}

// Clasificación por puntos, únicamente sobre duplas confirmadas — nunca
// depende de partidos/rondas/llaves, que ya no existen en el modelo.
// Empates comparten posición ("competition ranking": 1,1,3, nunca un
// desempate inventado) — nunca 1,1,2. Orden estable por created_at para
// que, dentro del mismo puntaje, la dupla inscrita primero aparezca
// primero, sin significar una posición distinta.
export function computeTournamentClassification(entries: TournamentEntryWithMembers[]): TournamentClassificationRow[] {
  const confirmed = entries
    .filter((e) => e.status === "confirmed")
    .slice()
    .sort((a, b) => b.points - a.points || a.created_at.localeCompare(b.created_at));

  const rows: TournamentClassificationRow[] = [];
  let lastPoints: number | null = null;
  let lastPosition = 0;
  confirmed.forEach((entry, index) => {
    const position = entry.points === lastPoints ? lastPosition : index + 1;
    rows.push({ entry, position });
    lastPoints = entry.points;
    lastPosition = position;
  });
  return rows;
}

// isOwnEntry: created_by is the reliable signal for "I created this entry
// myself" (always my own auth uid for a self-registered pending/withdrawn
// entry) — but a CONFIRMED entry's created_by can belong to the OWNER/ADMIN
// who registered it on the player's behalf, so membership in `members` is
// also checked. Display-only — never used for RPC authorization, the RPCs
// re-derive that themselves.
export function isOwnEntry(entry: TournamentEntryWithMembers, userId: string, ownClubMemberId: string): boolean {
  if (entry.created_by === userId) return true;
  return entry.members.some((m) => m.club_member_id === ownClubMemberId);
}
