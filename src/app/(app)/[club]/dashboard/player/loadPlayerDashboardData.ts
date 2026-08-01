import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { getPlayerReservations } from "@/lib/playerReservations";
import {
  getPlayerSportProfile,
  getPlayerTournamentsOverview,
  getPlayerClubReservationActivity,
  getUpcomingTournamentActivity,
  getUpcomingBookingDetails,
  getPlayerRecentActivity,
  computeAchievements,
  computeRankingTrend,
  computePlayedHours,
  pickNextBooking,
  type PlayerSportProfile,
  type PlayerTournamentsOverview,
  type PlayerAchievement,
  type PlayerActivityEvent,
  type UpcomingBookingDetails,
  type UpcomingTournamentActivity,
} from "@/lib/playerDashboard";
import type { MyReservation } from "@/lib/playerReservations";

export interface PlayerDashboardData {
  player: { id: string; full_name: string | null; avatar_url: string | null };
  profile: PlayerSportProfile | null;
  rankingTrend: ReturnType<typeof computeRankingTrend>;
  nextBooking: (MyReservation & UpcomingBookingDetails) | null;
  nextTournamentActivity: UpcomingTournamentActivity | null;
  tournamentsOverview: PlayerTournamentsOverview;
  playedHours: number;
  achievements: PlayerAchievement[];
  recentActivity: PlayerActivityEvent[];
}

// Composición server-side única del Dashboard del PLAYER — llamada una sola
// vez desde dashboard/page.tsx (rama PLAYER). Agrupa aquí toda consulta
// necesaria (reutilizando siempre lib existente, nunca una regla nueva) en
// vez de dejar que cada sección de la página dispare la suya por su cuenta.
export async function loadPlayerDashboardData(
  supabase: SupabaseClient<Database>,
  clubId: string,
  clubSlug: string,
  ownClubMemberId: string,
  userId: string,
  userEmail: string | null,
  todayStr: string
): Promise<PlayerDashboardData> {
  const [identity, { myBookings }, profile, tournamentsOverview, reservationActivity] = await Promise.all([
    getSidebarIdentity(supabase, userId, userEmail),
    getPlayerReservations(supabase, clubId, userId, todayStr),
    getPlayerSportProfile(supabase, clubId),
    getPlayerTournamentsOverview(supabase, clubId, ownClubMemberId, userId),
    getPlayerClubReservationActivity(supabase, clubId, userId),
  ]);

  const nextBookingBase = pickNextBooking(myBookings);

  // Prioridad 3 (Torneo) solo se consulta cuando no hay ninguna reserva
  // próxima que mostrar — evita una consulta extra en el caso común.
  let nextBooking: (MyReservation & UpcomingBookingDetails) | null = null;
  let nextTournamentActivity: UpcomingTournamentActivity | null = null;
  if (nextBookingBase) {
    const details = await getUpcomingBookingDetails(supabase, nextBookingBase.id, userId);
    nextBooking = { ...nextBookingBase, ...details };
  } else {
    nextTournamentActivity = await getUpcomingTournamentActivity(supabase, clubId, ownClubMemberId);
  }

  const achievements = computeAchievements(profile, tournamentsOverview.stats);
  const rankingTrend = computeRankingTrend(profile?.evolution ?? []);
  const playedHours = computePlayedHours(reservationActivity);
  const recentActivity = await getPlayerRecentActivity(
    supabase,
    clubId,
    clubSlug,
    ownClubMemberId,
    reservationActivity,
    profile
  );

  return {
    player: { id: userId, full_name: identity.name, avatar_url: identity.avatarUrl },
    profile,
    rankingTrend,
    nextBooking,
    nextTournamentActivity,
    tournamentsOverview,
    playedHours,
    achievements,
    recentActivity,
  };
}
