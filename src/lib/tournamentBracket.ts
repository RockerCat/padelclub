import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getTournamentEntriesWithMembers } from "@/lib/tournamentEntries";

export interface BracketEntryPlayer {
  club_member_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface BracketEntry {
  id: string;
  category: string;
  secondaryCategory: string | null;
  players: BracketEntryPlayer[];
}

export interface BracketMatch {
  id: string;
  matchNumber: number;
  status: string;
  entryOne: BracketEntry | null;
  entryTwo: BracketEntry | null;
  // Displayed match_number of the source match (never the UUID) — used
  // to render "Ganador del partido N" until that source match's winner
  // is propagated (a future block; entryOne/entryTwo already reflect the
  // real entry the moment that happens, this is only the fallback label).
  sourceMatchOneNumber: number | null;
  sourceMatchTwoNumber: number | null;
  winnerEntryId: string | null;
}

export interface BracketRound {
  roundNumber: number;
  label: string;
  matches: BracketMatch[];
}

const TOTAL_ROUNDS_BY_BRACKET_SIZE: Record<number, number> = { 4: 2, 8: 3, 16: 4 };

const ROUND_LABEL_FROM_END = ["Final", "Semifinales", "Cuartos de final", "Octavos de final"];

// Names are derived purely from bracket_size + round_number — never
// hardcoded beyond the 3 supported sizes, never a tournament_rounds table.
// Falls back to "Ronda N" only defensively (bracket_size is constrained to
// 4/8/16 at the database level, so this should never actually be reached).
export function getTournamentRoundLabel(bracketSize: number, roundNumber: number): string {
  const totalRounds = TOTAL_ROUNDS_BY_BRACKET_SIZE[bracketSize];
  if (!totalRounds) return `Ronda ${roundNumber}`;
  const fromEnd = totalRounds - roundNumber;
  return ROUND_LABEL_FROM_END[fromEnd] ?? `Ronda ${roundNumber}`;
}

// Shared by the OWNER/ADMIN and PLAYER detail pages — same query shape,
// same view model, never two versions of the same rule (CLAUDE.md →
// Shared View & Data Patterns). Exactly 4 queries total regardless of
// bracket size, never one per match/entry/player: (1) tournament_matches,
// then (2)-(4) reused verbatim from getTournamentEntriesWithMembers
// (entries, entry_members, club_members+profiles) — already the exact
// entry+members shape EntriesSection needs, so the bracket never
// duplicates that resolution logic.
export async function getTournamentBracketView(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  clubId: string,
  bracketSize: number
): Promise<{ rounds: BracketRound[]; error: string | null }> {
  const [matchesRes, entriesResult] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("club_id", clubId),
    getTournamentEntriesWithMembers(supabase, tournamentId, clubId),
  ]);

  if (matchesRes.error || entriesResult.error) {
    return { rounds: [], error: "No se pudo cargar el cuadro del torneo." };
  }

  const matches = matchesRes.data ?? [];
  const matchNumberById = new Map(matches.map((m) => [m.id, m.match_number]));
  const entryById = new Map(entriesResult.entries.map((e) => [e.id, e]));

  function toBracketEntry(entryId: string | null): BracketEntry | null {
    if (!entryId) return null;
    const entry = entryById.get(entryId);
    if (!entry) return null;
    return {
      id: entry.id,
      category: entry.category,
      secondaryCategory: entry.secondary_category,
      players: entry.members.map((m) => ({
        club_member_id: m.club_member_id,
        full_name: m.full_name,
        avatar_url: m.avatar_url,
      })),
    };
  }

  const matchesByRound = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    const list = matchesByRound.get(m.round_number) ?? [];
    list.push({
      id: m.id,
      matchNumber: m.match_number,
      status: m.status,
      entryOne: toBracketEntry(m.entry_one_id),
      entryTwo: toBracketEntry(m.entry_two_id),
      sourceMatchOneNumber: m.source_match_one_id ? matchNumberById.get(m.source_match_one_id) ?? null : null,
      sourceMatchTwoNumber: m.source_match_two_id ? matchNumberById.get(m.source_match_two_id) ?? null : null,
      winnerEntryId: m.winner_entry_id,
    });
    matchesByRound.set(m.round_number, list);
  }

  // round_number asc, match_number asc within each round — never trusting
  // the order Supabase happened to return.
  const rounds: BracketRound[] = [...matchesByRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([roundNumber, roundMatches]) => ({
      roundNumber,
      label: getTournamentRoundLabel(bracketSize, roundNumber),
      matches: [...roundMatches].sort((a, b) => a.matchNumber - b.matchNumber),
    }));

  return { rounds, error: null };
}
