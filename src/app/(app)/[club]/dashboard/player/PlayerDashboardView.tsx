import type { MyReservation } from "@/lib/playerReservations";
import type {
  PlayerSportProfile,
  PlayerTournamentsOverview,
  PlayerAchievement,
  PlayerActivityEvent,
  UpcomingBookingDetails,
  UpcomingTournamentActivity,
  computeRankingTrend,
} from "@/lib/playerDashboard";
import { PlayerDashboardHeader } from "./PlayerDashboardHeader";
import { UpcomingActivityCard } from "./UpcomingActivityCard";
import { SportEvolutionSection } from "./SportEvolutionSection";
import { SportSummaryGrid } from "./SportSummaryGrid";
import { MyTournamentsSection } from "./MyTournamentsSection";
import { AchievementsSection } from "./AchievementsSection";
import { RecentActivitySection } from "./RecentActivitySection";

interface PlayerDashboardViewProps {
  clubSlug: string;
  clubName: string;
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

// Dashboard deportivo personal del PLAYER — punto de entrada al club (ver
// getClubEntryPath). Server Component puramente de composición visual: toda
// la resolución de datos ya ocurrió en src/lib/playerDashboard.ts, llamada
// una sola vez desde [club]/dashboard/page.tsx (rama PLAYER) — este
// componente solo distribuye lo ya calculado.
//
// Orden vigente (mobile-first, y también el orden de lectura en desktop):
// encabezado contextual, tarjeta deportiva, próxima actividad, evolución,
// resumen, logros (con protagonismo, antes de torneos), mis torneos,
// actividad reciente (acordeón a todo el ancho). Cada sección ya resuelve
// su propia grilla responsive internamente (tarjetas de resumen, tarjetas
// de torneo, logros) — ninguna necesita una columna angosta a su lado, así
// que el layout general es una sola columna de ancho completo también en
// desktop, nunca la distribución del Dashboard administrativo.
export function PlayerDashboardView({
  clubSlug,
  clubName,
  player,
  profile,
  rankingTrend,
  nextBooking,
  nextTournamentActivity,
  tournamentsOverview,
  playedHours,
  achievements,
  recentActivity,
}: PlayerDashboardViewProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado contextual — deja explícito que TODO lo que sigue es la
          membresía de este jugador en ESTE club (nunca agregado entre
          clubes: otra membresía del mismo usuario en otro club puede
          mostrar datos distintos). No repite categoría/puntos/posición —
          eso ya vive en la tarjeta deportiva justo debajo. */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Evolución de {player.full_name ?? "Jugador"}</h1>
        <p className="text-sm text-brand-muted mt-1">
          Tu actividad, ranking y resultados en {clubName}.
        </p>
      </div>

      <PlayerDashboardHeader player={player} profile={profile} trend={rankingTrend} />

      <UpcomingActivityCard clubSlug={clubSlug} booking={nextBooking} tournamentActivity={nextTournamentActivity} />

      <SportEvolutionSection evolution={profile?.evolution ?? []} />

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

      <MyTournamentsSection clubSlug={clubSlug} cards={tournamentsOverview.cards} />

      <RecentActivitySection items={recentActivity} />
    </div>
  );
}
