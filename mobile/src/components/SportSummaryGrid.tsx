import { StyleSheet, Text, View } from "react-native";
import { Star, Hash, Layers, Trophy, Medal, Crown, Clock, type LucideIcon } from "lucide-react-native";
import { theme } from "../lib/theme";

function StatTile({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return (
    <View style={styles.tile}>
      <View style={styles.iconCircle}>
        <Icon width={16} height={16} color={theme.colors.primary} />
      </View>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

interface SportSummaryGridProps {
  currentPoints: number;
  rankingPosition: number | null;
  rankingTotal: number;
  category: string | null;
  torneosJugados: number;
  torneosGanados: number;
  podios: number;
  playedHours: number;
}

// Traducción 1:1 de SportSummaryGrid.tsx (app web) — "Resumen deportivo",
// mismas 7 métricas personales, todas ya resueltas en playerDashboard.ts
// (RPC de perfil deportivo + mis torneos + reservas del club); este
// componente solo las presenta. Grilla de 2 columnas (web cae a
// grid-cols-2 en mobile).
export function SportSummaryGrid({
  currentPoints,
  rankingPosition,
  rankingTotal,
  category,
  torneosJugados,
  torneosGanados,
  podios,
  playedHours,
}: SportSummaryGridProps) {
  return (
    <View>
      <Text style={styles.title}>Resumen deportivo</Text>
      <View style={styles.grid}>
        <StatTile label="Puntos actuales" value={String(currentPoints)} Icon={Star} />
        <StatTile
          label="Posición actual"
          value={rankingPosition !== null ? `#${rankingPosition}${rankingTotal ? ` / ${rankingTotal}` : ""}` : "—"}
          Icon={Hash}
        />
        <StatTile label="Categoría" value={category ?? "—"} Icon={Layers} />
        <StatTile label="Torneos jugados" value={String(torneosJugados)} Icon={Trophy} />
        <StatTile label="Torneos ganados" value={String(torneosGanados)} Icon={Crown} />
        <StatTile label="Podios" value={String(podios)} Icon={Medal} />
        <StatTile label="Horas jugadas" value={String(playedHours)} Icon={Clock} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "47%",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    padding: 14,
    gap: 6,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: `${theme.colors.primary}26`,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { color: theme.colors.white, fontSize: 19, fontWeight: "700" },
  label: { color: theme.colors.muted, fontSize: 11, lineHeight: 14 },
});
