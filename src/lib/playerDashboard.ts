import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tournament, TournamentEntryStatus } from "@/types/database";
import {
  getTournamentEntriesWithMembers,
  computeTournamentClassification,
  isOwnEntry,
} from "@/lib/tournamentEntries";
import { compareTournaments } from "@/lib/tournamentSort";
import type { MyReservation } from "@/lib/playerReservations";

// Picks the single soonest booking to headline "Próxima actividad" — same
// visibility/ordering rule as sortBookingsByProximity
// (@/components/reservations/PlayerActivity: in-progress first, then
// soonest start), reimplemented here rather than imported because that
// module is "use client" (a Server Component cannot call a function
// exported from a client-boundary module — it would receive an opaque
// client reference, not the real function). myBookings is already scoped
// to today-forward by getPlayerReservations, so no extra "has it ended"
// filter is needed beyond in-progress-vs-upcoming ordering.
export function pickNextBooking(myBookings: MyReservation[], now: Date = new Date()): MyReservation | null {
  if (myBookings.length === 0) return null;
  const withStart = myBookings.map((r) => ({
    reservation: r,
    start: new Date(`${r.date}T${r.start_time.slice(0, 5)}:00`).getTime(),
  }));
  withStart.sort((a, b) => {
    const aInProgress = a.start <= now.getTime() ? 0 : 1;
    const bInProgress = b.start <= now.getTime() ? 0 : 1;
    if (aInProgress !== bInProgress) return aInProgress - bInProgress;
    return a.start - b.start;
  });
  return withStart[0].reservation;
}

// ─── Server-side composition for the PLAYER's personal sport Dashboard ─────
// (CLAUDE.md → new "Dashboard deportivo del PLAYER"). Every query here
// reuses an existing RPC, table (through its existing RLS), or lib
// function — nothing here invents a business rule that doesn't already
// exist elsewhere in the codebase (ranking, tournaments, reservations).
// Grouped in one module, called once from the page, so no two dashboard
// sections ever issue the same query twice.

// ─── 1. Sport profile (categoría, puntos, posición, evolución) ────────────
// Thin wrapper around get_my_club_sport_profile (20261002000002) — the one
// new piece of backend this feature needed, since club_member_sport_state/
// club_player_point_movements/club_player_category_changes have zero RLS
// policies and no client GRANT (see that migration's own header comment).

export interface PlayerSportEvolutionPoint {
  snapshotAt: string;
  points: number;
  rankingPosition: number;
}

export interface PlayerSportProfile {
  category: string | null;
  currentPoints: number;
  rankingPosition: number | null;
  rankingTotal: number;
  recentCategoryChange: {
    previousCategory: string;
    newCategory: string;
    changeType: "promotion" | "demotion" | "correction";
    createdAt: string;
  } | null;
  everPromoted: boolean;
  evolution: PlayerSportEvolutionPoint[];
}

export async function getPlayerSportProfile(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<PlayerSportProfile | null> {
  const { data, error } = await supabase.rpc("get_my_club_sport_profile", { p_club_id: clubId });
  if (error || !data) return null;
  return data as unknown as PlayerSportProfile;
}

// "Cambio reciente de categoría" en el encabezado solo se muestra dentro de
// esta ventana — puramente de presentación (ajustable sin migración); más
// allá de esto el cambio sigue existiendo, solo deja de considerarse
// "reciente" para el encabezado (la línea de tiempo de Actividad reciente,
// más abajo, lo sigue mostrando igual, sin este filtro).
const RECENT_CATEGORY_CHANGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isRecentCategoryChange(createdAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(createdAt).getTime() <= RECENT_CATEGORY_CHANGE_WINDOW_MS;
}

// "Subiste/Bajaste N posiciones" — compara la posición actual (último punto
// de evolution) contra el snapshot real más cercano a, pero no después de,
// `windowMs` atrás. null cuando no existe ningún snapshot anterior a esa
// ventana (historial insuficiente) o cuando el cambio neto es cero — nunca
// se inventa una tendencia.
export function computeRankingTrend(
  evolution: PlayerSportEvolutionPoint[],
  windowMs: number = RECENT_CATEGORY_CHANGE_WINDOW_MS,
  now: Date = new Date()
): { delta: number; direction: "up" | "down" } | null {
  if (evolution.length === 0) return null;
  const cutoff = now.getTime() - windowMs;
  const current = evolution[evolution.length - 1];

  let past: PlayerSportEvolutionPoint | null = null;
  for (const point of evolution) {
    if (new Date(point.snapshotAt).getTime() <= cutoff) {
      past = point;
    } else {
      break;
    }
  }
  if (!past) return null;

  const delta = past.rankingPosition - current.rankingPosition;
  if (delta === 0) return null;
  return { delta: Math.abs(delta), direction: delta > 0 ? "up" : "down" };
}

// ─── 2. Próxima actividad ───────────────────────────────────────────────────
// Prioridad 1/2 (Reserva/Partido) resueltas por el caller a partir de
// myBookings ya cargado por getPlayerReservations (@/lib/playerReservations)
// — nunca una segunda consulta de reservas. Esta sección solo agrega el
// fallback de prioridad 3 (Torneo), que myBookings no cubre.

export interface UpcomingTournamentActivity {
  tournament: Pick<Tournament, "id" | "slug" | "name" | "starts_at" | "status" | "category" | "secondary_category">;
  entryStatus: TournamentEntryStatus;
}

export interface UpcomingBookingDetails {
  type: "match" | "class" | "block";
  companions: string[];
}

// Tipo + compañeros de la próxima reserva — consulta puntual (una sola
// reserva), nunca cargada para toda la lista de myBookings, ya que solo la
// ganadora de pickNextBooking se muestra destacada. MyReservation
// (@/lib/playerReservations) no trae `type` ni participantes, por eso esta
// consulta separada en vez de ensanchar ese select compartido con otras
// pantallas.
export async function getUpcomingBookingDetails(
  supabase: SupabaseClient<Database>,
  reservationId: string,
  excludeProfileId: string
): Promise<UpcomingBookingDetails> {
  const [reservationRes, playersRes] = await Promise.all([
    supabase.from("reservations").select("type").eq("id", reservationId).single(),
    supabase
      .from("reservation_players")
      .select("profiles(full_name)")
      .eq("reservation_id", reservationId)
      .neq("profile_id", excludeProfileId),
  ]);

  const companions = ((playersRes.data ?? []) as unknown as Array<{ profiles: { full_name: string | null } | null }>)
    .map((row) => row.profiles?.full_name)
    .filter((name): name is string => !!name);

  return { type: (reservationRes.data?.type as UpcomingBookingDetails["type"]) ?? "match", companions };
}

export async function getUpcomingTournamentActivity(
  supabase: SupabaseClient<Database>,
  clubId: string,
  ownClubMemberId: string
): Promise<UpcomingTournamentActivity | null> {
  const { data: memberRows } = await supabase
    .from("tournament_entry_members")
    .select("tournament_entry_id")
    .eq("club_id", clubId)
    .eq("club_member_id", ownClubMemberId)
    .eq("is_active", true);

  const entryIds = [...new Set((memberRows ?? []).map((r) => r.tournament_entry_id))];
  if (entryIds.length === 0) return null;

  const { data: entries } = await supabase
    .from("tournament_entries")
    .select("id, tournament_id, status")
    .eq("club_id", clubId)
    .in("id", entryIds)
    .in("status", ["pending", "confirmed"]);

  const tournamentIds = [...new Set((entries ?? []).map((e) => e.tournament_id))];
  if (tournamentIds.length === 0) return null;

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, slug, name, starts_at, status, category, secondary_category")
    .eq("club_id", clubId)
    .in("id", tournamentIds)
    .in("status", ["registration_open", "in_progress"]);

  if (!tournaments || tournaments.length === 0) return null;

  // Próximo por starts_at ascendente — sin fecha definida al final, nunca
  // primero (un torneo sin fecha no es "lo más próximo").
  const sorted = [...tournaments].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return 0;
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;
    return a.starts_at.localeCompare(b.starts_at);
  });

  const tournament = sorted[0];
  const myEntry = (entries ?? []).find((e) => e.tournament_id === tournament.id)!;
  return { tournament, entryStatus: myEntry.status as TournamentEntryStatus };
}

// ─── 3. Reservas históricas del club (resumen + línea de tiempo) ──────────
// Misma regla de participación personal que public._my_reservations
// (20260817000001): participante en reservation_players, O creador siendo
// PLAYER — este Dashboard solo es alcanzable por un PLAYER, así que la
// segunda condición siempre se cumple para sus propias reservas creadas.
// Consulta directa a `reservations`/`reservation_players` (no una RPC): a
// diferencia de Mi Perfil (que debe seguir leyendo tras dejar el club), el
// jugador aquí es por definición un miembro ACTIVO del club que se está
// visualizando, así que la política RLS existente ("club members read
// reservations", is_club_role(club_id) IS NOT NULL) ya lo autoriza sin
// necesitar una función SECURITY DEFINER nueva.

export interface ClubReservationRecord {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: "match" | "class" | "block";
  status: "confirmed" | "pending" | "cancelled" | "rejected";
  created_by: string;
  created_at: string;
  updated_at: string;
}

const RESERVATION_HISTORY_SELECT = "id, date, start_time, duration_minutes, type, status, created_by, created_at, updated_at";

export async function getPlayerClubReservationActivity(
  supabase: SupabaseClient<Database>,
  clubId: string,
  playerId: string
): Promise<ClubReservationRecord[]> {
  const [ownRes, participantRes] = await Promise.all([
    supabase
      .from("reservations")
      .select(RESERVATION_HISTORY_SELECT)
      .eq("club_id", clubId)
      .eq("created_by", playerId)
      .neq("type", "block")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("reservation_players")
      .select(`reservations!inner(${RESERVATION_HISTORY_SELECT})`)
      .eq("profile_id", playerId)
      .eq("reservations.club_id", clubId)
      .neq("reservations.type", "block")
      .limit(40),
  ]);

  const byId = new Map<string, ClubReservationRecord>();
  for (const row of (ownRes.data ?? []) as unknown as ClubReservationRecord[]) {
    byId.set(row.id, row);
  }
  for (const row of (participantRes.data ?? []) as unknown as Array<{ reservations: ClubReservationRecord | null }>) {
    if (row.reservations) byId.set(row.reservations.id, row.reservations);
  }
  return Array.from(byId.values());
}

function isReservationFinished(r: ClubReservationRecord, now: Date): boolean {
  const end = new Date(`${r.date}T${r.start_time.slice(0, 5)}:00`);
  end.setMinutes(end.getMinutes() + r.duration_minutes);
  return end.getTime() <= now.getTime();
}

// "Horas jugadas" — únicamente reservas confirmadas cuyo horario ya pasó
// (nunca una futura, aunque ya esté confirmada) — el proxy más honesto
// disponible con este esquema (CLAUDE.md → Player Statistics Principles:
// "confirmada" nunca implica asistencia verificada).
export function computePlayedHours(reservations: ClubReservationRecord[], now: Date = new Date()): number {
  const minutes = reservations
    .filter((r) => r.status === "confirmed" && isReservationFinished(r, now))
    .reduce((sum, r) => sum + r.duration_minutes, 0);
  return Math.round((minutes / 60) * 10) / 10;
}

// ─── 4. Mis torneos (tarjetas + resumen) ───────────────────────────────────
// Reutiliza exactamente getTournamentEntriesWithMembers/
// computeTournamentClassification/isOwnEntry (@/lib/tournamentEntries) —
// la misma clasificación oficial (con empates) que ya usa el detalle de
// torneo. Nunca se recalculan puntos ni posiciones con una fórmula propia.

export interface PlayerTournamentCard {
  tournament: Tournament;
  entryStatus: TournamentEntryStatus;
  partnerName: string | null;
  partnerAvatarUrl: string | null;
  position: number | null; // solo cuando el torneo está completed
  points: number | null;
}

export interface PlayerTournamentsOverview {
  cards: PlayerTournamentCard[];
  stats: { torneosJugados: number; torneosGanados: number; podios: number };
}

const EMPTY_TOURNAMENTS_OVERVIEW: PlayerTournamentsOverview = {
  cards: [],
  stats: { torneosJugados: 0, torneosGanados: 0, podios: 0 },
};

export async function getPlayerTournamentsOverview(
  supabase: SupabaseClient<Database>,
  clubId: string,
  ownClubMemberId: string,
  ownProfileId: string
): Promise<PlayerTournamentsOverview> {
  const { data: memberRows } = await supabase
    .from("tournament_entry_members")
    .select("tournament_entry_id")
    .eq("club_id", clubId)
    .eq("club_member_id", ownClubMemberId)
    .eq("is_active", true);

  const entryIds = [...new Set((memberRows ?? []).map((r) => r.tournament_entry_id))];
  if (entryIds.length === 0) return EMPTY_TOURNAMENTS_OVERVIEW;

  const { data: myEntries } = await supabase
    .from("tournament_entries")
    .select("id, tournament_id, status")
    .eq("club_id", clubId)
    .in("id", entryIds);

  const relevantEntries = (myEntries ?? []).filter((e) => e.status === "pending" || e.status === "confirmed");
  const tournamentIds = [...new Set(relevantEntries.map((e) => e.tournament_id))];
  if (tournamentIds.length === 0) return EMPTY_TOURNAMENTS_OVERVIEW;

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .eq("club_id", clubId)
    .in("id", tournamentIds)
    .neq("status", "cancelled");

  const tournamentList = ((tournaments ?? []) as Tournament[]).sort(compareTournaments);
  if (tournamentList.length === 0) return EMPTY_TOURNAMENTS_OVERVIEW;

  const results = await Promise.all(
    tournamentList.map(async (t) => {
      const categories = [t.category, t.secondary_category].filter((c): c is string => !!c);
      const { entries } = await getTournamentEntriesWithMembers(supabase, t.id, clubId, categories);
      return { tournament: t, entries };
    })
  );

  let torneosJugados = 0;
  let torneosGanados = 0;
  let podios = 0;

  const cards: PlayerTournamentCard[] = [];

  for (const { tournament: t, entries } of results) {
    // RLS can legitimately hide my own entry row here (e.g. a still-pending
    // entry my partner registered, created_by = their uid, not mine — the
    // same documented gap noted in tournamentEntries.ts) — when that
    // happens there is no honest status/points to show, so the tournament
    // is simply skipped rather than guessed.
    const myEntry = entries.find((e) => isOwnEntry(e, ownProfileId, ownClubMemberId));
    if (!myEntry) continue;

    let position: number | null = null;
    const partner = myEntry.members.find((m) => m.club_member_id !== ownClubMemberId);

    if (t.status === "completed" && myEntry.status === "confirmed") {
      const classification = computeTournamentClassification(entries);
      const row = classification.find((r) => r.entry.id === myEntry.id);
      if (row) {
        position = row.position;
        torneosJugados += 1;
        if (position === 1) torneosGanados += 1;
        if (position <= 3) podios += 1;
      }
    }

    cards.push({
      tournament: t,
      entryStatus: myEntry.status,
      partnerName: partner?.full_name ?? null,
      partnerAvatarUrl: partner?.avatar_url ?? null,
      position,
      points: myEntry.points,
    });
  }

  return { cards: cards.slice(0, 6), stats: { torneosJugados, torneosGanados, podios } };
}

// ─── 5. Actividad reciente (línea de tiempo personal) ──────────────────────
// Une exclusivamente eventos ya existentes en otras tablas/RPCs — nunca un
// sistema de actividad nuevo: reservas creadas por mí + su confirmación
// (derivada de created_at vs. updated_at), inscripciones a torneo, torneos
// finalizados en los que participé, movimientos de puntos (derivados de
// los saltos reales entre snapshots de `evolution`, ver arriba — nunca una
// segunda consulta al ledger) y el cambio de categoría más reciente.

export interface PlayerActivityEvent {
  id: string;
  type: "reservation_created" | "reservation_confirmed" | "tournament_entry_created" | "tournament_completed" | "points_movement" | "category_change";
  at: string;
  label: string;
  href: string | null;
}

const RESERVATION_TYPE_LABEL: Record<string, string> = { match: "un partido", class: "una clase" };

export async function getPlayerRecentActivity(
  supabase: SupabaseClient<Database>,
  clubId: string,
  clubSlug: string,
  ownClubMemberId: string,
  reservations: ClubReservationRecord[],
  sportProfile: PlayerSportProfile | null
): Promise<PlayerActivityEvent[]> {
  const events: PlayerActivityEvent[] = [];

  for (const r of reservations) {
    events.push({
      id: `res-created-${r.id}`,
      type: "reservation_created",
      at: r.created_at,
      label: `Creaste una reserva para ${RESERVATION_TYPE_LABEL[r.type] ?? "una reserva"}`,
      href: `/${clubSlug}/reservations`,
    });
    if (r.status === "confirmed" && r.updated_at !== r.created_at) {
      events.push({
        id: `res-confirmed-${r.id}`,
        type: "reservation_confirmed",
        at: r.updated_at,
        label: "Tu reserva fue confirmada",
        href: `/${clubSlug}/reservations`,
      });
    }
  }

  // Inscripciones/torneos finalizados — mis entries en cualquier torneo del
  // club, resueltas por tournament_entry_members (mismo patrón que la
  // sección de torneos arriba, consulta independiente porque aquí interesa
  // CUALQUIER estado histórico, no solo pending/confirmed).
  const { data: memberRows } = await supabase
    .from("tournament_entry_members")
    .select("tournament_entry_id, created_at")
    .eq("club_id", clubId)
    .eq("club_member_id", ownClubMemberId);

  const entryIds = [...new Set((memberRows ?? []).map((r) => r.tournament_entry_id))];
  if (entryIds.length > 0) {
    const { data: myEntries } = await supabase
      .from("tournament_entries")
      .select("id, tournament_id, created_at")
      .eq("club_id", clubId)
      .in("id", entryIds);

    const tournamentIds = [...new Set((myEntries ?? []).map((e) => e.tournament_id))];
    if (tournamentIds.length > 0) {
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, slug, name, status, completed_at")
        .eq("club_id", clubId)
        .in("id", tournamentIds);

      const tournamentById = new Map((tournaments ?? []).map((t) => [t.id, t]));
      // Un jugador puede tener más de un entry en el MISMO torneo (p.ej. se
      // retiró y volvió a inscribirse) — "torneo finalizado" es un evento
      // del torneo, no de la inscripción, así que se emite una sola vez por
      // tournament_id sin importar cuántos entries propios existan.
      const completedTournamentIdsSeen = new Set<string>();

      for (const entry of myEntries ?? []) {
        const t = tournamentById.get(entry.tournament_id);
        if (!t) continue;
        events.push({
          id: `tournament-entry-${entry.id}`,
          type: "tournament_entry_created",
          at: entry.created_at,
          label: `Te inscribiste al torneo ${t.name}`,
          href: `/${clubSlug}/tournaments/${t.slug}`,
        });
        if (t.status === "completed" && t.completed_at && !completedTournamentIdsSeen.has(t.id)) {
          completedTournamentIdsSeen.add(t.id);
          events.push({
            id: `tournament-completed-${t.id}`,
            type: "tournament_completed",
            at: t.completed_at,
            label: `Torneo ${t.name} finalizado`,
            href: `/${clubSlug}/tournaments/${t.slug}`,
          });
        }
      }
    }
  }

  // Movimientos de puntos — derivados de los saltos reales entre snapshots
  // consecutivos de evolution (cada snapshot != el arranque del ciclo
  // corresponde a un movimiento real del ledger, ver la migración) — nunca
  // una segunda consulta a club_player_point_movements.
  if (sportProfile) {
    const evolution = sportProfile.evolution;
    for (let i = 1; i < evolution.length; i++) {
      const delta = evolution[i].points - evolution[i - 1].points;
      if (delta === 0) continue;
      events.push({
        id: `points-${evolution[i].snapshotAt}-${i}`,
        type: "points_movement",
        at: evolution[i].snapshotAt,
        label: delta > 0 ? `Ganaste ${delta} puntos` : `Se ajustaron tus puntos (${delta})`,
        href: `/${clubSlug}/ranking`,
      });
    }

    if (sportProfile.recentCategoryChange) {
      const change = sportProfile.recentCategoryChange;
      events.push({
        id: `category-change-${change.createdAt}`,
        type: "category_change",
        at: change.createdAt,
        label:
          change.changeType === "promotion"
            ? `Ascendiste a ${change.newCategory}`
            : change.changeType === "demotion"
              ? `Bajaste a ${change.newCategory}`
              : `Tu categoría se corrigió a ${change.newCategory}`,
        href: `/${clubSlug}/ranking`,
      });
    }
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  return events.slice(0, 15);
}

// ─── 6. Logros deportivos ───────────────────────────────────────────────────
// Calculados en el momento, exclusivamente a partir de datos ya resueltos
// arriba — nunca un sistema de logros persistido/nuevo.

export interface PlayerAchievement {
  id: string;
  label: string;
}

export function computeAchievements(
  profile: PlayerSportProfile | null,
  tournamentStats: PlayerTournamentsOverview["stats"]
): PlayerAchievement[] {
  const achievements: PlayerAchievement[] = [];
  if (tournamentStats.torneosJugados >= 1) achievements.push({ id: "first-tournament", label: "Primer torneo" });
  if (tournamentStats.podios >= 1) achievements.push({ id: "first-podium", label: "Primer podio" });
  if (tournamentStats.torneosGanados >= 1) achievements.push({ id: "first-championship", label: "Primer campeonato" });
  if (profile?.rankingPosition !== null && profile?.rankingPosition !== undefined && profile.rankingPosition <= 3) {
    achievements.push({ id: "top-3", label: "Top 3 del ranking" });
  }
  if (profile?.everPromoted) achievements.push({ id: "category-promotion", label: "Ascenso de categoría" });
  return achievements;
}
