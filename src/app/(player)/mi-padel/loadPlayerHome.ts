import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPlayerReservations } from "@/lib/playerReservations";
import {
  computeAchievements,
  computeRankingTrend,
  getPlayerClubReservationActivity,
  getPlayerSportProfile,
  getPlayerTournamentsOverview,
  getUpcomingTournamentActivity,
} from "@/lib/playerDashboard";
import { getReservationTimeStatus } from "../../../../shared/reservations/editPolicy";
import {
  mergeUpcoming,
  pickPreferredCity,
  toPlayedReservations,
  type ClubSportSnapshot,
  type PreferredCity,
  type UpcomingItem,
} from "@/lib/playerHome";
import {
  formatSpotsLeft,
  listMyOpenMatches,
  listOpenMatches,
  openMatchPath,
  openMatchPlaceName,
  type OpenMatch,
} from "@/lib/openMatches";
import { getBogotaNow, isoToBogotaWallClock } from "@/lib/utils/bogotaDatetime";

export interface PlayerHomeClub {
  clubId: string;
  clubSlug: string;
  clubName: string;
  clubLogoUrl: string | null;
  city: string | null;
  archived: boolean;
  deactivated: boolean;
}

export interface PlayerHomeData {
  clubs: PlayerHomeClub[];
  /** Solo clubes operativos (no desactivados por plataforma). */
  sport: ClubSportSnapshot[];
  upcoming: UpcomingItem[];
  myUpcomingMatchCount: number;
  opportunities: OpenMatch[];
  preferredCity: PreferredCity | null;
  todayStr: string;
  loadErrors: string[];
}

type MembershipRow = {
  id: string;
  clubs: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    city: string | null;
    archived_at: string | null;
    is_active: boolean;
  };
};

// Tope defensivo: cada club dispara las mismas lecturas que su propio
// dashboard (en paralelo entre clubes). Un jugador real pertenece a pocos.
const MAX_CLUBS = 8;

// Composición server-side única de "Mi Pádel". Toda lectura reutiliza
// funciones ya existentes, ejecutadas con la sesión del propio jugador (RLS
// y RPCs self-only: get_my_club_sport_profile, list_my_open_matches) —
// nunca service role.
export async function loadPlayerHome(supabase: SupabaseClient<Database>, userId: string): Promise<PlayerHomeData> {
  const now = getBogotaNow();
  const todayStr = now.dateStr;
  const loadErrors: string[] = [];

  const [membershipsRes, myMatchesRes] = await Promise.all([
    supabase
      .from("club_members")
      .select("id, clubs!inner(id, name, slug, logo_url, city, archived_at, is_active)")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .eq("role", "PLAYER")
      .order("joined_at", { ascending: true })
      .limit(MAX_CLUBS),
    listMyOpenMatches(supabase),
  ]);

  if (membershipsRes.error) loadErrors.push("clubs");
  if (myMatchesRes.error) loadErrors.push("matches");

  const memberships = (membershipsRes.data ?? []) as unknown as MembershipRow[];
  const clubs: PlayerHomeClub[] = memberships.map((m) => ({
    clubId: m.clubs.id,
    clubSlug: m.clubs.slug,
    clubName: m.clubs.name,
    clubLogoUrl: m.clubs.logo_url,
    city: m.clubs.city,
    archived: !!m.clubs.archived_at,
    deactivated: !m.clubs.is_active,
  }));

  // ─── Por club: exactamente las lecturas del dashboard deportivo del club.
  const operational = memberships.filter((m) => m.clubs.is_active);
  const perClub = await Promise.all(
    operational.map(async (m) => {
      const club = m.clubs;
      const [profile, tournaments, reservationActivity, reservations, nextTournament] = await Promise.all([
        getPlayerSportProfile(supabase, club.id),
        getPlayerTournamentsOverview(supabase, club.id, m.id, userId),
        getPlayerClubReservationActivity(supabase, club.id, userId),
        club.archived_at ? Promise.resolve(null) : getPlayerReservations(supabase, club.id, userId, todayStr),
        getUpcomingTournamentActivity(supabase, club.id, m.id),
      ]);

      const snapshot: ClubSportSnapshot = {
        clubId: club.id,
        clubSlug: club.slug,
        clubName: club.name,
        clubLogoUrl: club.logo_url,
        archived: !!club.archived_at,
        category: profile?.category ?? null,
        currentPoints: profile?.currentPoints ?? 0,
        rankingPosition: profile?.rankingPosition ?? null,
        rankingTotal: profile?.rankingTotal ?? 0,
        trend: computeRankingTrend(profile?.evolution ?? []),
        evolution: profile?.evolution ?? [],
        tournaments: tournaments.stats,
        playedReservations: toPlayedReservations(reservationActivity),
        achievements: computeAchievements(profile, tournaments.stats),
      };

      const upcoming: UpcomingItem[] = [];
      for (const b of reservations?.myBookings ?? []) {
        if (getReservationTimeStatus(b.date, b.start_time, b.duration_minutes, now) === "past") continue;
        upcoming.push({
          key: `reservation:${b.id}`,
          kind: "booking",
          date: b.date,
          time: b.start_time.slice(0, 5),
          title: `Reserva · ${b.courtName}`,
          origin: club.name,
          status: "Confirmada",
          href: `/${club.slug}/reservations/${b.id}`,
          needsAction: false,
        });
      }
      for (const r of reservations?.myReservations ?? []) {
        if (r.status !== "pending") continue;
        upcoming.push({
          key: `reservation:${r.id}`,
          kind: "request",
          date: r.date,
          time: r.start_time.slice(0, 5),
          title: `Solicitud · ${r.courtName}`,
          origin: club.name,
          status: "Pendiente de aprobación del club",
          href: `/${club.slug}/reservations/${r.id}`,
          needsAction: false,
        });
      }
      if (nextTournament) {
        const wall = isoToBogotaWallClock(nextTournament.tournament.starts_at);
        upcoming.push({
          key: `tournament:${nextTournament.tournament.id}`,
          kind: "tournament",
          date: wall ? wall.slice(0, 10) : "9999-12-31",
          time: wall ? wall.slice(11, 16) : null,
          title: nextTournament.tournament.name,
          origin: club.name,
          status: nextTournament.entryStatus === "pending" ? "Inscripción pendiente" : "Inscrito",
          href: `/${club.slug}/tournaments/${nextTournament.tournament.slug}`,
          needsAction: false,
        });
      }
      return { snapshot, upcoming };
    })
  );

  // ─── Partidos abiertos propios (organizo o juego).
  const myMatches = myMatchesRes.data ?? [];
  const myUpcomingMatches = myMatches.filter((m) => m.phase === "open" || m.phase === "full");
  const matchItems: UpcomingItem[] = myUpcomingMatches.map((m) => ({
    key: `open_match:${m.id}`,
    kind: "open_match",
    date: m.matchDate,
    time: m.startTime,
    title: `Partido en ${openMatchPlaceName(m) ?? m.city}`,
    origin: m.viewerIsOrganizer ? "Partido abierto · organizas" : "Partido abierto",
    status: m.viewerNeedsReconfirm
      ? "Cambió el horario: confirma tu asistencia"
      : `${formatSpotsLeft(m.spotsLeft)} · ${m.courtStatus === "booked" ? "cancha reservada" : "cancha por confirmar"}`,
    href: openMatchPath(m.id),
    needsAction: m.viewerNeedsReconfirm,
  }));

  const upcoming = mergeUpcoming([...matchItems, ...perClub.flatMap((c) => c.upcoming)], 5);

  // ─── Oportunidades: partidos abiertos con cupo, en la ciudad conocida.
  const preferredCity = pickPreferredCity(
    [...myMatches].sort((a, b) => b.matchDate.localeCompare(a.matchDate)).map((m) => m.city),
    clubs.map((c) => c.city)
  );
  const opportunitiesRes = await listOpenMatches(supabase, { city: preferredCity?.city ?? null, minSpots: 1 });
  if (opportunitiesRes.error) loadErrors.push("opportunities");
  const opportunities = (opportunitiesRes.data ?? []).filter((m) => !m.viewerIsParticipant).slice(0, 3);

  return {
    clubs,
    sport: perClub.map((c) => c.snapshot),
    upcoming,
    myUpcomingMatchCount: myUpcomingMatches.length,
    opportunities,
    preferredCity,
    todayStr,
    loadErrors,
  };
}
