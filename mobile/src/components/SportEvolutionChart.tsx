import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { formatShortDate } from "../lib/dateFormat";
import { isoToBogotaWallClock } from "../lib/bogotaDatetime";
import type { PlayerSportEvolutionPoint } from "../lib/playerDashboard";
import { theme } from "../lib/theme";

type Metric = "points" | "position";
type Range = "30d" | "3m" | "6m" | "hist";

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "points", label: "Puntos" },
  { value: "position", label: "Posición" },
];

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "30d", label: "30 días" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "hist", label: "Histórico" },
];

const RANGE_MS: Record<Exclude<Range, "hist">, number> = {
  "30d": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "6m": 182 * 24 * 60 * 60 * 1000,
};

// Misma fecha compacta ("mié 12 ago") que el resto de la app nativa
// (formatShortDate), siempre sobre la fecha calendario en America/Bogota
// del instante real (isoToBogotaWallClock) — mismo huso fijo que
// SportEvolutionSection.tsx (app web) usa para evitar que un snapshot
// cercano a medianoche caiga en un día distinto según el huso del
// dispositivo.
function formatCompactDate(iso: string): string {
  return formatShortDate(isoToBogotaWallClock(iso).slice(0, 10));
}

// Recorta al rango elegido, conservando el último punto anterior al corte
// (si existe) para que la línea nunca "empiece de la nada" a mitad de
// valor — misma regla que la versión web.
function filterByRange(points: PlayerSportEvolutionPoint[], range: Range, now: Date): PlayerSportEvolutionPoint[] {
  if (range === "hist") return points;
  const cutoff = now.getTime() - RANGE_MS[range];
  const filtered = points.filter((p) => new Date(p.snapshotAt).getTime() >= cutoff);
  if (filtered.length === points.length) return filtered;
  const lastBeforeCutoff = points[points.length - filtered.length - 1];
  return lastBeforeCutoff ? [lastBeforeCutoff, ...filtered] : filtered;
}

// Traducción 1:1 de SportEvolutionSection.tsx (app web) — mismas 2
// métricas (Puntos/Posición) y 4 rangos (30 días/3 meses/6 meses/
// Histórico), mismo recorte de rango conservando el punto anterior al
// corte, mismo trazado por evento (espaciado uniforme, no proporcional al
// tiempo real). Sin tooltip por punto (la versión web usa <title>, un
// hover que no existe en touch) — la fecha/valor de cada extremo se lee
// debajo del trazo, igual que la web.
export function SportEvolutionChart({ evolution }: { evolution: PlayerSportEvolutionPoint[] }) {
  const [metric, setMetric] = useState<Metric>("points");
  const [range, setRange] = useState<Range>("3m");
  const { width: windowWidth } = useWindowDimensions();

  // "Ahora" anclado al último punto de evolution (no un new Date() fresco)
  // — puramente por consistencia con la fuente web; en mobile no hay
  // hidratación server/cliente, pero mantiene el cálculo idéntico y
  // determinista frente a los mismos datos.
  const now = useMemo(() => {
    const last = evolution[evolution.length - 1];
    return last ? new Date(last.snapshotAt) : new Date(0);
  }, [evolution]);
  const points = useMemo(() => filterByRange(evolution, range, now), [evolution, range, now]);

  const hasHistory = points.length >= 2;

  const width = Math.max(windowWidth - 64, points.length * 36);
  const height = 140;
  const padX = 12;
  const padY = 16;

  const scaledValues = points.map((p) => (metric === "points" ? p.points : -p.rankingPosition));
  const min = Math.min(...scaledValues, 0);
  const max = Math.max(...scaledValues, 0);
  const valueRange = max - min || 1;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((scaledValues[i] - min) / valueRange) * (height - padY * 2);
    return { x, y, point: p };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Evolución deportiva</Text>

      <View style={styles.filterGroup}>
        <View style={styles.filterRow}>
          {METRIC_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setMetric(opt.value)}
              style={[styles.pill, metric === opt.value && styles.pillActive]}
            >
              <Text style={[styles.pillText, metric === opt.value && styles.pillTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterRow}>
          {RANGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setRange(opt.value)}
              style={[styles.pill, range === opt.value && styles.pillActive]}
            >
              <Text style={[styles.pillText, range === opt.value && styles.pillTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!hasHistory ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Todavía no hay suficiente historial para mostrar esta evolución.</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <Svg width={width} height={height}>
              <Polyline points={polylinePoints} fill="none" stroke={theme.colors.primary} strokeWidth={2} />
              {coords.map((c, i) => (
                <Circle key={i} cx={c.x} cy={c.y} r={3} fill={theme.colors.primary} />
              ))}
            </Svg>
            <View style={[styles.axisRow, { width }]}>
              <Text style={styles.axisText}>{formatCompactDate(points[0].snapshotAt)}</Text>
              <Text style={styles.axisText}>{formatCompactDate(points[points.length - 1].snapshotAt)}</Text>
            </View>
          </View>
        </ScrollView>
      )}
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
    gap: 12,
  },
  title: { color: theme.colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  filterGroup: { gap: 8 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillActive: { backgroundColor: `${theme.colors.primary}2E`, borderColor: theme.colors.primary },
  pillText: { fontSize: 12, color: theme.colors.muted, fontWeight: "600" },
  pillTextActive: { color: theme.colors.primary },
  emptyState: { paddingVertical: 32, alignItems: "center" },
  emptyText: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingHorizontal: 2 },
  axisText: { color: theme.colors.muted, fontSize: 10, opacity: 0.7 },
});
