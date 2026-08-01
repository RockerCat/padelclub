import { TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import type { PlayerSportProfile } from "@/lib/playerDashboard";
import { isRecentCategoryChange, type computeRankingTrend } from "@/lib/playerDashboard";

interface PlayerDashboardHeaderProps {
  player: { id: string; full_name: string | null; avatar_url: string | null };
  profile: PlayerSportProfile | null;
  trend: ReturnType<typeof computeRankingTrend>;
}

// Encabezado deportivo — sección 1 del spec. Puramente presentacional:
// toda la lectura/derivación real (categoría, puntos, posición, tendencia,
// cambio reciente) ya ocurrió en playerDashboard.ts / la RPC
// get_my_club_sport_profile; este componente nunca decide qué es "reciente"
// ni recalcula nada.
export function PlayerDashboardHeader({ player, profile, trend }: PlayerDashboardHeaderProps) {
  const category = profile?.category ?? null;
  const rankingPosition = profile?.rankingPosition ?? null;
  const showRecentChange = !!profile?.recentCategoryChange && isRecentCategoryChange(profile.recentCategoryChange.createdAt);

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex items-center gap-4">
      <PlayerSportAvatar
        player={player}
        size="xl"
        sportCategory={category}
        rankingPosition={rankingPosition}
      />

      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-white truncate">{player.full_name ?? "Jugador"}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-brand-muted">
          {category && <span>Categoría {category}</span>}
          {rankingPosition !== null && (
            <span className="text-white font-semibold">
              #{rankingPosition}
              {profile?.rankingTotal ? ` de ${profile.rankingTotal}` : ""}
            </span>
          )}
          <span className="font-semibold" style={{ color: "var(--club-primary)" }}>
            {profile?.currentPoints ?? 0} puntos
          </span>
        </div>

        {(trend || showRecentChange) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {trend && (
              <span
                className={
                  "inline-flex items-center gap-1 text-xs font-medium " +
                  (trend.direction === "up" ? "text-emerald-400" : "text-red-400")
                }
              >
                {trend.direction === "up" ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {trend.direction === "up" ? "Subiste" : "Bajaste"} {trend.delta} {trend.delta === 1 ? "posición" : "posiciones"}
              </span>
            )}
            {showRecentChange && profile?.recentCategoryChange && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary">
                {profile.recentCategoryChange.changeType === "promotion" ? (
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownCircle className="w-3.5 h-3.5" />
                )}
                {profile.recentCategoryChange.changeType === "promotion" ? "Ascendiste a" : "Bajaste a"}{" "}
                {profile.recentCategoryChange.newCategory}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
