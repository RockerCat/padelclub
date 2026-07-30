import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getTournamentEntriesWithMembers } from "@/lib/tournamentEntries";

export interface BracketEntryPlayer {
  club_member_id: string;
  full_name: string | null;
  avatar_url: string | null;
  // Bloque 3.3 — categoría deportiva real de este jugador (ver
  // TournamentEntryMemberDisplay.category en tournamentEntries.ts); null si
  // todavía no tiene estado deportivo aprovisionado.
  category: string | null;
}

export interface BracketEntry {
  id: string;
  category: string;
  secondaryCategory: string | null;
  players: BracketEntryPlayer[];
}

export interface BracketMatch {
  id: string;
  roundNumber: number;
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
  // Bloque 2.4 — scheduling. tournamentCourtAllocationId lets the
  // reprogramming form pre-select the current allocation; courtId/Name
  // are already denormalized onto tournament_matches itself by
  // schedule_tournament_match, never re-derived from the allocation.
  tournamentCourtAllocationId: string | null;
  courtId: string | null;
  courtName: string | null;
  scheduledDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  // Bloque 2.5 — lifecycle. Score columns are exactly the 6 fixed columns
  // on tournament_matches, smallint, never a JSON/array shape.
  startedAt: string | null;
  completedAt: string | null;
  setOneEntryOne: number | null;
  setOneEntryTwo: number | null;
  setTwoEntryOne: number | null;
  setTwoEntryTwo: number | null;
  setThreeEntryOne: number | null;
  setThreeEntryTwo: number | null;
  // Whether some OTHER match in this bracket references this one as a
  // source (i.e. this is not the final), and if so whether that
  // destination is still 'pending' with nothing recorded on it yet —
  // exactly the two conditions correct_tournament_match_result itself
  // requires (audited, 20260913000001). Computed once here from the
  // already-loaded match list, never guessed.
  hasDestination: boolean;
  destinationIsPending: boolean;
}

// A match can only ever be scheduled through schedule_tournament_match,
// which requires (audited, 20260912000001): tournament status
// bracket_generated/in_progress, match status pending/scheduled, AND both
// entries already resolved. In practice, until a future block builds
// winner-propagation UI, this means only round-1 matches are ever
// schedulable — a later-round match stays unschedulable until its
// participants are known, never a client-side guess.
export function isMatchSchedulable(
  match: Pick<BracketMatch, "status" | "entryOne" | "entryTwo">,
  tournamentStatus: string
): boolean {
  return (
    (tournamentStatus === "bracket_generated" || tournamentStatus === "in_progress") &&
    (match.status === "pending" || match.status === "scheduled") &&
    !!match.entryOne &&
    !!match.entryTwo
  );
}

// The three lifecycle gates below mirror start_tournament_match /
// record_tournament_match_result / correct_tournament_match_result
// exactly (audited, 20260913000001) — never a looser client-side guess.
// The RPC remains the real authority in every case; these only decide
// whether to show the action at all.
export function canStartTournamentMatch(match: Pick<BracketMatch, "status">, tournamentStatus: string): boolean {
  return (tournamentStatus === "bracket_generated" || tournamentStatus === "in_progress") && match.status === "scheduled";
}

export function canRecordTournamentMatchResult(match: Pick<BracketMatch, "status">, tournamentStatus: string): boolean {
  return tournamentStatus === "in_progress" && match.status === "in_progress";
}

export function canCorrectTournamentMatchResult(
  match: Pick<BracketMatch, "status" | "hasDestination" | "destinationIsPending">,
  tournamentStatus: string
): boolean {
  return (
    tournamentStatus === "in_progress" &&
    match.status === "completed" &&
    match.hasDestination &&
    match.destinationIsPending
  );
}

export interface TournamentMatchScoreInput {
  setOneEntryOne: number | null;
  setOneEntryTwo: number | null;
  setTwoEntryOne: number | null;
  setTwoEntryTwo: number | null;
  setThreeEntryOne: number | null;
  setThreeEntryTwo: number | null;
}

export type TournamentMatchScoreValidation =
  | { valid: true; winner: "one" | "two" }
  | { valid: false; error: string };

// Pure client-side mirror of record_tournament_match_result's/
// correct_tournament_match_result's own score validation (both share the
// identical sequence, audited 20260913000001) — same order, same
// messages translated to Spanish, same winner derivation. Never a
// "sportier" rule the backend doesn't itself enforce (e.g. this never
// requires 6/7 games or a 2-game margin — the backend doesn't either).
// The backend remains the authority; this only lets the UI show an
// inline error and the computed winner before submitting.
export function validateTournamentMatchScore(s: TournamentMatchScoreInput): TournamentMatchScoreValidation {
  if (s.setOneEntryOne == null || s.setOneEntryTwo == null || s.setTwoEntryOne == null || s.setTwoEntryTwo == null) {
    return { valid: false, error: "Completa el marcador de los sets 1 y 2." };
  }

  if (
    s.setOneEntryOne < 0 ||
    s.setOneEntryTwo < 0 ||
    s.setTwoEntryOne < 0 ||
    s.setTwoEntryTwo < 0 ||
    (s.setThreeEntryOne ?? 0) < 0 ||
    (s.setThreeEntryTwo ?? 0) < 0
  ) {
    return { valid: false, error: "El marcador no puede tener valores negativos." };
  }

  if (s.setOneEntryOne === s.setOneEntryTwo) return { valid: false, error: "El set 1 no puede terminar empatado." };
  if (s.setTwoEntryOne === s.setTwoEntryTwo) return { valid: false, error: "El set 2 no puede terminar empatado." };

  const hasSetThree = s.setThreeEntryOne != null || s.setThreeEntryTwo != null;
  if ((s.setThreeEntryOne != null) !== (s.setThreeEntryTwo != null)) {
    return { valid: false, error: "El set 3 debe completarse por completo o dejarse vacío." };
  }
  if (hasSetThree && s.setThreeEntryOne === s.setThreeEntryTwo) {
    return { valid: false, error: "El set 3 no puede terminar empatado." };
  }

  let entryOneSets = 0;
  let entryTwoSets = 0;
  if (s.setOneEntryOne > s.setOneEntryTwo) entryOneSets++;
  else entryTwoSets++;
  if (s.setTwoEntryOne > s.setTwoEntryTwo) entryOneSets++;
  else entryTwoSets++;

  if (!hasSetThree) {
    if (entryOneSets !== 2 && entryTwoSets !== 2) {
      return { valid: false, error: "Un partido a dos sets debe ganarse 2-0." };
    }
  } else {
    if (entryOneSets !== 1 || entryTwoSets !== 1) {
      return {
        valid: false,
        error: "El set 3 solo es válido cuando cada pareja ganó uno de los dos primeros sets.",
      };
    }
    if (s.setThreeEntryOne! > s.setThreeEntryTwo!) entryOneSets++;
    else entryTwoSets++;
  }

  if (entryOneSets === 2) return { valid: true, winner: "one" };
  if (entryTwoSets === 2) return { valid: true, winner: "two" };
  return { valid: false, error: "El marcador no produce un ganador válido." };
}

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Same convention already used for reservations (PendingReservationReview.tsx):
// full weekday + day + month name, plain 24h "HH:MM" sliced directly from the
// stored time string — never a 12h/AM-PM format, which has no precedent
// anywhere in this codebase.
export function formatMatchScheduleDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} de ${MONTH[d.getMonth()]}`;
}

export function formatMatchScheduleTimeRange(startTime: string, endTime: string | null): string {
  const start = startTime.slice(0, 5);
  if (!endTime) return start;
  return `${start} – ${endTime.slice(0, 5)}`;
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
// Shared View & Data Patterns). 5 to 7 queries total regardless of bracket
// size, never one per match/entry/player/court: (1) tournament_matches,
// (2)-(4 or 5) reused verbatim from getTournamentEntriesWithMembers
// (entries, entry_members, club_members+profiles, plus up to 2 category
// RPC calls since Bloque 3.3), (last) courts for the distinct court_ids
// already denormalized onto tournament_matches — never a query per match,
// and never tournament_court_allocations here (PLAYER has no
// read access to it by RLS; the schedule shown to everyone lives entirely
// on tournament_matches itself).
export async function getTournamentBracketView(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  clubId: string,
  bracketSize: number,
  // Bloque 3.3 — reenviado tal cual a getTournamentEntriesWithMembers para
  // resolver la categoría real de cada jugador (máximo 2 llamadas, nunca
  // una por partido/entry/jugador).
  categories: string[]
): Promise<{ rounds: BracketRound[]; error: string | null }> {
  const [matchesRes, entriesResult] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("club_id", clubId),
    getTournamentEntriesWithMembers(supabase, tournamentId, clubId, categories),
  ]);

  if (matchesRes.error || entriesResult.error) {
    return { rounds: [], error: "No se pudo cargar el cuadro del torneo." };
  }

  const matches = matchesRes.data ?? [];
  const matchNumberById = new Map(matches.map((m) => [m.id, m.match_number]));
  const entryById = new Map(entriesResult.entries.map((e) => [e.id, e]));

  // destinationStatusBySourceId: for each match that IS a source, the
  // status of the one match that references it — used to derive
  // hasDestination/destinationIsPending without a second query (the full
  // match list is already loaded).
  const destinationStatusBySourceId = new Map<string, string>();
  for (const m of matches) {
    if (m.source_match_one_id) destinationStatusBySourceId.set(m.source_match_one_id, m.status);
    if (m.source_match_two_id) destinationStatusBySourceId.set(m.source_match_two_id, m.status);
  }

  const courtIds = [...new Set(matches.map((m) => m.court_id).filter((id): id is string => !!id))];
  const courtNameById = new Map<string, string>();
  if (courtIds.length > 0) {
    const { data: courts, error: courtsError } = await supabase
      .from("courts")
      .select("id, name")
      .eq("club_id", clubId)
      .in("id", courtIds);
    if (courtsError) return { rounds: [], error: "No se pudo cargar el cuadro del torneo." };
    for (const c of courts ?? []) courtNameById.set(c.id, c.name);
  }

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
        category: m.category,
      })),
    };
  }

  const matchesByRound = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    const list = matchesByRound.get(m.round_number) ?? [];
    list.push({
      id: m.id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
      status: m.status,
      entryOne: toBracketEntry(m.entry_one_id),
      entryTwo: toBracketEntry(m.entry_two_id),
      sourceMatchOneNumber: m.source_match_one_id ? matchNumberById.get(m.source_match_one_id) ?? null : null,
      sourceMatchTwoNumber: m.source_match_two_id ? matchNumberById.get(m.source_match_two_id) ?? null : null,
      winnerEntryId: m.winner_entry_id,
      tournamentCourtAllocationId: m.tournament_court_allocation_id,
      courtId: m.court_id,
      courtName: m.court_id ? courtNameById.get(m.court_id) ?? null : null,
      scheduledDate: m.scheduled_date,
      scheduledStartTime: m.scheduled_start_time,
      scheduledEndTime: m.scheduled_end_time,
      startedAt: m.started_at,
      completedAt: m.completed_at,
      setOneEntryOne: m.set_one_entry_one,
      setOneEntryTwo: m.set_one_entry_two,
      setTwoEntryOne: m.set_two_entry_one,
      setTwoEntryTwo: m.set_two_entry_two,
      setThreeEntryOne: m.set_three_entry_one,
      setThreeEntryTwo: m.set_three_entry_two,
      hasDestination: destinationStatusBySourceId.has(m.id),
      destinationIsPending: destinationStatusBySourceId.get(m.id) === "pending",
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

export interface TournamentCourtAllocationView {
  id: string;
  courtId: string;
  courtName: string;
  allocationDate: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

// OWNER/ADMIN only (RLS: tournament_court_allocations_select_admin has no
// PLAYER/anon branch) — never called from the PLAYER detail page. 2
// queries total: allocations, then courts grouped by the distinct
// court_ids found — never a query per allocation. Active first, then
// court name asc, inactive last — never trusting DB return order.
export async function getTournamentCourtAllocations(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  clubId: string
): Promise<{ allocations: TournamentCourtAllocationView[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("tournament_court_allocations")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("club_id", clubId);

  if (error) return { allocations: [], error: "No se pudieron cargar las canchas del torneo." };

  const courtIds = [...new Set((rows ?? []).map((r) => r.court_id))];
  const courtNameById = new Map<string, string>();
  if (courtIds.length > 0) {
    const { data: courts, error: courtsError } = await supabase
      .from("courts")
      .select("id, name")
      .eq("club_id", clubId)
      .in("id", courtIds);
    if (courtsError) return { allocations: [], error: "No se pudieron cargar las canchas del torneo." };
    for (const c of courts ?? []) courtNameById.set(c.id, c.name);
  }

  const allocations: TournamentCourtAllocationView[] = (rows ?? [])
    .map((r) => ({
      id: r.id,
      courtId: r.court_id,
      courtName: courtNameById.get(r.court_id) ?? "Cancha",
      allocationDate: r.allocation_date,
      startTime: r.start_time,
      endTime: r.end_time,
      isActive: r.is_active,
    }))
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.courtName.localeCompare(b.courtName);
    });

  return { allocations, error: null };
}
