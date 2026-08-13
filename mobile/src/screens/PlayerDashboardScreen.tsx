import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getPlayerReservations, type MyReservation } from "../lib/playerReservations";
import {
  getPlayerSportProfile,
  getUpcomingBookingDetails,
  getUpcomingTournamentActivity,
  getPlayerTournamentsOverview,
  getPlayerClubReservationActivity,
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
} from "../lib/playerDashboard";
import { PlayerDashboardHeader } from "../components/PlayerDashboardHeader";
import { UpcomingActivityCard } from "../components/UpcomingActivityCard";
import { SportEvolutionChart } from "../components/SportEvolutionChart";
import { SportSummaryGrid } from "../components/SportSummaryGrid";
import { AchievementsSection } from "../components/AchievementsSection";
import { MyTournamentsSection } from "../components/MyTournamentsSection";
import { RecentActivitySection } from "../components/RecentActivitySection";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";

const EMPTY_TOURNAMENTS_OVERVIEW: PlayerTournamentsOverview = {
  cards: [],
  stats: { torneosJugados: 0, torneosGanados: 0, podios: 0 },
};

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Dashboard deportivo nativo del PLAYER — equivalente completo de
// src/app/(app)/[club]/dashboard/player/PlayerDashboardView.tsx (app web,
// rama PLAYER de dashboard/page.tsx): encabezado deportivo, próxima
// actividad, evolución deportiva, resumen deportivo, logros, mis torneos
// y actividad reciente — mismo orden exacto que la web. Toda la
// resolución de datos reutiliza exactamente las mismas funciones puras
// que la web ya usa, en shared/players/playerDashboard.ts (ver ese
// módulo) — nada se recalcula ni se reimplementa aquí. Ranking (contenido
// de /[club]/ranking en la web) sigue fuera de esta pantalla: no es parte
// del Dashboard, y en mobile su tab sigue siendo un PlaceholderScreen
// (módulo aparte, no implementado) — dependencia externa real, ver
// reporte de la tarea.
export function PlayerDashboardScreen() {
  const { session } = useAuth();
  const { club, clubMemberId, identity } = useClub();

  const [profile, setProfile] = useState<PlayerSportProfile | null>(null);
  const [nextBooking, setNextBooking] = useState<(MyReservation & UpcomingBookingDetails) | null>(null);
  const [nextTournamentActivity, setNextTournamentActivity] = useState<UpcomingTournamentActivity | null>(null);
  const [tournamentsOverview, setTournamentsOverview] = useState<PlayerTournamentsOverview>(EMPTY_TOURNAMENTS_OVERVIEW);
  const [playedHours, setPlayedHours] = useState(0);
  const [achievements, setAchievements] = useState<PlayerAchievement[]>([]);
  const [recentActivity, setRecentActivity] = useState<PlayerActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!club || !clubMemberId || !session?.user) return;
    setLoadError(null);
    try {
      const [sportProfile, { myBookings }, overview, reservationActivity] = await Promise.all([
        getPlayerSportProfile(supabase, club.id),
        getPlayerReservations(supabase, club.id, session.user.id, todayStr()),
        getPlayerTournamentsOverview(supabase, club.id, clubMemberId, session.user.id),
        getPlayerClubReservationActivity(supabase, club.id, session.user.id),
      ]);
      setProfile(sportProfile);
      setTournamentsOverview(overview);
      setPlayedHours(computePlayedHours(reservationActivity));
      setAchievements(computeAchievements(sportProfile, overview.stats));

      const base = pickNextBooking(myBookings);
      if (base) {
        const details = await getUpcomingBookingDetails(supabase, base.id, session.user.id);
        setNextBooking({ ...base, ...details });
        setNextTournamentActivity(null);
      } else {
        setNextBooking(null);
        setNextTournamentActivity(await getUpcomingTournamentActivity(supabase, club.id, clubMemberId));
      }

      setRecentActivity(
        await getPlayerRecentActivity(supabase, club.id, club.slug, clubMemberId, reservationActivity, sportProfile)
      );
    } catch {
      setLoadError("No pudimos cargar tu Dashboard. Desliza para reintentar.");
    }
  }, [club, clubMemberId, session?.user]);

  useEffect(() => {
    if (!club || !clubMemberId) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [club, clubMemberId, load]);

  // El Tab Navigator mantiene esta pantalla montada al cambiar de tab
  // (nunca la desmonta) — sin esto, "Próxima actividad" podía seguir
  // mostrando una reserva ya cancelada/editada desde otra pantalla (p. ej.
  // ReservationDetailScreen, vía ReservasTab) hasta el próximo pull-to-
  // refresh manual. Mismo patrón ya usado en TournamentDetailScreen.tsx
  // (recargar al recuperar foco) — nunca un mecanismo nuevo. Sin toggle de
  // `loading`: es un refresco silencioso en segundo plano, no debe volver
  // a mostrar los skeletons cada vez que el jugador visita este tab.
  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [club, clubMemberId])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const rankingTrend = computeRankingTrend(profile?.evolution ?? []);

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        {loading ? (
          <View style={{ gap: 16 }}>
            <Skeleton style={{ height: 92, borderRadius: theme.radius.xl }} />
            <Skeleton style={{ height: 120, borderRadius: theme.radius.xl }} />
            <Skeleton style={{ height: 220, borderRadius: theme.radius.xl }} />
            <Skeleton style={{ height: 160, borderRadius: theme.radius.xl }} />
          </View>
        ) : loadError ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={load}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View>
              <Text style={styles.introTitle}>Evolución de {identity?.name ?? "Jugador"}</Text>
              <Text style={styles.introSubtitle}>Tu actividad, ranking y resultados en {club?.name ?? "tu club"}.</Text>
            </View>

            <PlayerDashboardHeader
              player={{ id: session?.user?.id ?? "", full_name: identity?.name ?? null, avatar_url: identity?.avatarUrl ?? null }}
              profile={profile}
              trend={rankingTrend}
            />
            <UpcomingActivityCard booking={nextBooking} tournamentActivity={nextTournamentActivity} />
            <SportEvolutionChart evolution={profile?.evolution ?? []} />
            <SportSummaryGrid
              currentPoints={profile?.currentPoints ?? 0}
              rankingPosition={profile?.rankingPosition ?? null}
              rankingTotal={profile?.rankingTotal ?? 0}
              category={profile?.category ?? null}
              torneosJugados={tournamentsOverview.stats.torneosJugados}
              torneosGanados={tournamentsOverview.stats.torneosGanados}
              podios={tournamentsOverview.stats.podios}
              playedHours={playedHours}
            />
            <AchievementsSection achievements={achievements} />
            <MyTournamentsSection cards={tournamentsOverview.cards} />
            <RecentActivitySection items={recentActivity} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 16 },
  introTitle: { color: theme.colors.white, fontSize: 20, fontWeight: "800" },
  introSubtitle: { color: theme.colors.muted, fontSize: 13, marginTop: 4 },
  errorState: { alignItems: "center", gap: 12, paddingVertical: 32 },
  errorText: { color: theme.colors.danger, fontSize: 14, textAlign: "center" },
  retryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: 20, paddingVertical: 10 },
  retryButtonText: { color: theme.colors.bg, fontWeight: "700" },
});
