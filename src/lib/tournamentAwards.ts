import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type TournamentAwardState = "pending" | "ready" | "awarded" | "partial";

export interface TournamentAwardPlayer {
  clubMemberId: string;
  name: string;
  avatarUrl: string | null;
  placement: string;
  participationPoints: number;
  placementPoints: number;
  totalPoints: number;
  awardedAt: string | null;
}

export interface TournamentAwardPair {
  // null only if get_tournament_points_summary could not resolve a
  // confirmed entry for this member (defensive — should not happen in
  // practice, since award_tournament_points itself requires every
  // participation movement to belong to a confirmed entry). Never
  // invented, never dropped — surfaced as an inconsistent pair instead.
  entryId: string | null;
  placement: string;
  players: TournamentAwardPlayer[];
  pairTotalPoints: number;
}

export interface TournamentAwardSummary {
  state: TournamentAwardState;
  expectedMovementCount: number;
  actualMovementCount: number;
  // Same timestamp for every movement of one settlement (single
  // transaction, single `now()` snapshot) — taken from any real movement
  // row. Null when there is nothing to show yet (pending/ready).
  awardedAt: string | null;
  pairs: TournamentAwardPair[];
  // true when some entry did not resolve to exactly two players — the
  // section still renders that pair (fallback, never a blank page), but
  // callers may want to flag it administratively.
  hasIncompletePairs: boolean;
}

const PLACEMENT_RANK: Record<string, number> = {
  champion: 1,
  runner_up: 2,
  semifinalist: 3,
  participant: 4,
};

interface WorkingPlayer extends TournamentAwardPlayer {
  entryId: string | null;
}

// get_tournament_points_summary is the ONLY read access this loader ever
// uses — club_player_point_movements and club_member_sport_state remain
// RLS-closed with zero policies (confirmed Bloque 2.5.1); this function
// never queries them directly, never uses the service role, and never
// reconstructs points from the bracket. Exactly one RPC call, no N+1.
//
// The sentinel row (club_member_id NULL, returned whenever
// actual_movement_count = 0) is interpreted here exclusively as metadata
// and immediately discarded from the movements list — it is never turned
// into a player, pair, or card. Metadata (state/expected/actual) is read
// from the first row of the result, which is always present and always
// carries these three fields regardless of state.
export async function getTournamentPointsSummary(
  supabase: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string
): Promise<{ summary: TournamentAwardSummary | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_tournament_points_summary", {
    p_club_id: clubId,
    p_tournament_id: tournamentId,
  });

  if (error || !data || data.length === 0) {
    return { summary: null, error: "No se pudo cargar el estado de la premiación." };
  }

  const first = data[0];
  const state = first.award_state as TournamentAwardState;
  const expectedMovementCount = first.expected_movement_count;
  const actualMovementCount = first.actual_movement_count;

  const movementRows = data.filter((row) => row.club_member_id != null);

  const playersByMember = new Map<string, WorkingPlayer>();
  for (const row of movementRows) {
    const memberId = row.club_member_id!;
    const delta = row.delta ?? 0;
    const isParticipation = row.system_event_code === "tournament_participation";
    const existing = playersByMember.get(memberId);

    if (!existing) {
      playersByMember.set(memberId, {
        clubMemberId: memberId,
        name: row.player_name ?? "Jugador",
        avatarUrl: row.avatar_url,
        placement: row.placement ?? "participant",
        participationPoints: isParticipation ? delta : 0,
        placementPoints: isParticipation ? 0 : delta,
        totalPoints: delta,
        awardedAt: row.created_at,
        entryId: row.entry_id,
      });
    } else {
      existing.participationPoints += isParticipation ? delta : 0;
      existing.placementPoints += isParticipation ? 0 : delta;
      existing.totalPoints += delta;
      if (row.created_at && (!existing.awardedAt || row.created_at > existing.awardedAt)) {
        existing.awardedAt = row.created_at;
      }
    }
  }

  const playersByEntry = new Map<string | null, WorkingPlayer[]>();
  for (const player of playersByMember.values()) {
    const list = playersByEntry.get(player.entryId) ?? [];
    list.push(player);
    playersByEntry.set(player.entryId, list);
  }

  let hasIncompletePairs = false;
  const pairs: TournamentAwardPair[] = [];
  for (const [entryId, players] of playersByEntry) {
    if (entryId == null || players.length !== 2) hasIncompletePairs = true;

    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
    pairs.push({
      entryId,
      placement: sortedPlayers[0]?.placement ?? "participant",
      players: sortedPlayers.map((p) => ({
        clubMemberId: p.clubMemberId,
        name: p.name,
        avatarUrl: p.avatarUrl,
        placement: p.placement,
        participationPoints: p.participationPoints,
        placementPoints: p.placementPoints,
        totalPoints: p.totalPoints,
        awardedAt: p.awardedAt,
      })),
      pairTotalPoints: players.reduce((sum, p) => sum + p.totalPoints, 0),
    });
  }

  pairs.sort((a, b) => {
    const rankDiff = (PLACEMENT_RANK[a.placement] ?? 5) - (PLACEMENT_RANK[b.placement] ?? 5);
    if (rankDiff !== 0) return rankDiff;
    return (a.players[0]?.name ?? "").localeCompare(b.players[0]?.name ?? "");
  });

  const awardedAt = movementRows[0]?.created_at ?? null;

  return {
    summary: { state, expectedMovementCount, actualMovementCount, awardedAt, pairs, hasIncompletePairs },
    error: null,
  };
}

// Group headings ("Campeones") vs. per-player breakdown lines ("Campeón
// +30") are deliberately two different label sets — never the same string
// reused for both grammatical roles.
export function tournamentAwardPlacementGroupLabel(placement: string): string {
  switch (placement) {
    case "champion":
      return "Campeones";
    case "runner_up":
      return "Subcampeones";
    case "semifinalist":
      return "Semifinalistas";
    default:
      return "Participantes";
  }
}

export function tournamentAwardPlacementSingularLabel(placement: string): string {
  switch (placement) {
    case "champion":
      return "Campeón";
    case "runner_up":
      return "Subcampeón";
    case "semifinalist":
      return "Semifinalista";
    default:
      return "Participante";
  }
}

// Same "es-MX", day/month-name/year, hour:minute convention already used
// throughout the Torneos UI (e.g. TournamentDetailActions.formatDateTime).
export function formatTournamentAwardDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
