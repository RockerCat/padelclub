import { StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";

// Traducción 1:1 de WeekdayOccupancyChart.tsx (app web) — barras
// horizontales, siempre color neutro (cyan), nunca derivado de la
// magnitud.
export type WeekdayPoint = { id: string; label: string; pct: number; closed?: boolean };

export function WeekdayOccupancyChart({ points }: { points: WeekdayPoint[] }) {
  return (
    <View style={{ gap: 10 }}>
      {points.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.label}>{p.label}</Text>
          {p.closed ? (
            <Text style={styles.closedText}>Cerrado</Text>
          ) : (
            <>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${p.pct}%` }]} />
              </View>
              <Text style={styles.pct}>{p.pct}%</Text>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { fontSize: 12, color: theme.colors.muted, width: 32 },
  closedText: { fontSize: 11, color: "rgba(148,163,184,0.5)" },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: theme.colors.primary },
  pct: { fontSize: 12, fontWeight: "600", color: theme.colors.primary, width: 36, textAlign: "right" },
});
