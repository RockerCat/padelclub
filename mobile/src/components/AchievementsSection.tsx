import { StyleSheet, Text, View } from "react-native";
import { Trophy, Medal, Crown, Star, ArrowUpCircle, type LucideIcon } from "lucide-react-native";
import type { PlayerAchievement } from "../lib/playerDashboard";
import { theme } from "../lib/theme";

const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  "first-tournament": Trophy,
  "first-podium": Medal,
  "first-championship": Crown,
  "top-3": Star,
  "category-promotion": ArrowUpCircle,
};

const AMBER = "#FBBF24";

// Traducción 1:1 de AchievementsSection.tsx (app web) — computeAchievements
// (../lib/playerDashboard) ya decide, con datos reales, cuáles aplican;
// este componente nunca inventa ni oculta un logro por su cuenta. Sin
// logros todavía no se muestra la sección (nunca una grilla vacía), igual
// que la web. Mismos 5 logros posibles, mismo cálculo, mismo acento ámbar
// (nunca el cyan genérico de las demás métricas).
export function AchievementsSection({ achievements }: { achievements: PlayerAchievement[] }) {
  if (achievements.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Trophy width={16} height={16} color={AMBER} />
        <Text style={styles.title}>Logros deportivos</Text>
        <Text style={styles.count}>({achievements.length})</Text>
      </View>
      <View style={styles.grid}>
        {achievements.map((a) => {
          const Icon = ACHIEVEMENT_ICON[a.id] ?? Trophy;
          return (
            <View key={a.id} style={styles.tile}>
              <View style={styles.iconCircle}>
                <Icon width={20} height={20} color={AMBER} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {a.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: `${AMBER}33`,
    borderRadius: theme.radius.xl,
    padding: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  title: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
  count: { color: theme.colors.muted, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "47%",
    backgroundColor: `${AMBER}0F`,
    borderWidth: 1,
    borderColor: `${AMBER}33`,
    borderRadius: theme.radius.xl,
    padding: 14,
    alignItems: "center",
    gap: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    backgroundColor: `${AMBER}26`,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { color: theme.colors.white, fontSize: 12, fontWeight: "600", textAlign: "center" },
});
