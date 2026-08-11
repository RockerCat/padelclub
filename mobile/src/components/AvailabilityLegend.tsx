import { StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { theme } from "../lib/theme";

// Leyenda de la Agenda de Reservaciones — 5 estados (Disponible/Bloqueada/
// Confirmada/Pendiente/Seleccionado), estilo checkbox: swatches con solo
// borde (sin relleno) salvo "Seleccionado", que va sólido con check. El
// patrón de rayas de "Bloqueada" (repeating-linear-gradient en la web) se
// simplifica a un relleno sólido tenue — sin equivalente directo en RN.
const ITEMS: Array<{ label: string; borderColor: string; backgroundColor?: string; check?: boolean }> = [
  { label: "Disponible", borderColor: "rgba(255,255,255,0.25)" },
  { label: "Bloqueada", borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.08)" },
  { label: "Confirmada", borderColor: theme.colors.success },
  { label: "Pendiente", borderColor: theme.colors.warning },
  { label: "Seleccionado", borderColor: theme.colors.primary, backgroundColor: theme.colors.primary, check: true },
];

export function AvailabilityLegend() {
  return (
    <View style={styles.row}>
      {ITEMS.map((item) => (
        <View key={item.label} style={styles.item}>
          <View style={[styles.swatch, { borderColor: item.borderColor, backgroundColor: item.backgroundColor }]}>
            {item.check && <Check width={11} height={11} color={theme.colors.bg} strokeWidth={3} />}
          </View>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, color: theme.colors.muted },
});
