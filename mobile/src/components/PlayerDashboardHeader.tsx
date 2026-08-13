import { StyleSheet, Text, View } from "react-native";
import { TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle } from "lucide-react-native";
import { PlayerSportAvatar } from "./PlayerSportAvatar";
import { isRecentCategoryChange, type PlayerSportProfile, type computeRankingTrend } from "../lib/playerDashboard";
import { theme } from "../lib/theme";

interface PlayerDashboardHeaderProps {
  player: { id: string; full_name: string | null; avatar_url: string | null };
  profile: PlayerSportProfile | null;
  trend: ReturnType<typeof computeRankingTrend>;
}

// Traducción 1:1 de PlayerDashboardHeader.tsx (app web) — encabezado
// deportivo del Dashboard nativo del PLAYER. Puramente presentacional:
// toda la lectura/derivación real (categoría, puntos, posición, tendencia,
// cambio reciente) ya ocurrió en playerDashboard.ts / get_my_club_sport_profile.
export function PlayerDashboardHeader({ player, profile, trend }: PlayerDashboardHeaderProps) {
  const category = profile?.category ?? null;
  const rankingPosition = profile?.rankingPosition ?? null;
  const showRecentChange = !!profile?.recentCategoryChange && isRecentCategoryChange(profile.recentCategoryChange.createdAt);

  return (
    <View style={styles.card}>
      <PlayerSportAvatar player={player} size="xl" sportCategory={category} rankingPosition={rankingPosition} />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {player.full_name ?? "Jugador"}
        </Text>

        <View style={styles.metaRow}>
          {category && <Text style={styles.metaText}>Categoría {category}</Text>}
          {rankingPosition !== null && (
            <Text style={styles.metaStrong}>
              #{rankingPosition}
              {profile?.rankingTotal ? ` de ${profile.rankingTotal}` : ""}
            </Text>
          )}
          <Text style={styles.points}>{profile?.currentPoints ?? 0} puntos</Text>
        </View>

        {(trend || showRecentChange) && (
          <View style={styles.badgeRow}>
            {trend && (
              <View style={styles.badge}>
                {trend.direction === "up" ? (
                  <TrendingUp width={13} height={13} color="#34D399" />
                ) : (
                  <TrendingDown width={13} height={13} color={theme.colors.danger} />
                )}
                <Text style={[styles.badgeText, { color: trend.direction === "up" ? "#34D399" : theme.colors.danger }]}>
                  {trend.direction === "up" ? "Subiste" : "Bajaste"} {trend.delta} {trend.delta === 1 ? "posición" : "posiciones"}
                </Text>
              </View>
            )}
            {showRecentChange && profile?.recentCategoryChange && (
              <View style={styles.badge}>
                {profile.recentCategoryChange.changeType === "promotion" ? (
                  <ArrowUpCircle width={13} height={13} color={theme.colors.primary} />
                ) : (
                  <ArrowDownCircle width={13} height={13} color={theme.colors.primary} />
                )}
                <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                  {profile.recentCategoryChange.changeType === "promotion" ? "Ascendiste a" : "Bajaste a"}{" "}
                  {profile.recentCategoryChange.newCategory}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  info: { flex: 1, minWidth: 0 },
  name: { color: theme.colors.white, fontSize: 16, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 },
  metaText: { color: theme.colors.muted, fontSize: 13 },
  metaStrong: { color: theme.colors.white, fontSize: 13, fontWeight: "600" },
  points: { color: theme.colors.primary, fontSize: 13, fontWeight: "600" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4 },
  badgeText: { fontSize: 11, fontWeight: "600" },
});
