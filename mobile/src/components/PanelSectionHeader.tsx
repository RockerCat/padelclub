import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { ChevronUp, ChevronDown } from "lucide-react-native";
import { theme } from "../lib/theme";

// Traducción 1:1 de PanelSectionHeader en PlayerAvailabilityCalendar.tsx
// (app web): `flex items-center justify-between w-full py-1.5 -my-1.5
// gap-2` (padding vertical que solo agranda el área táctil, sin ocupar
// espacio visual — en RN eso es hitSlop, no padding real), `h2 text-sm
// font-semibold text-white` + count `text-brand-muted font-normal`,
// chevron `w-4 h-4 text-brand-muted` (ChevronUp/ChevronDown, mismo ícono
// lucide que la web).
export function PanelSectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={styles.row}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <Text style={styles.title}>
        {title} <Text style={styles.count}>({count})</Text>
      </Text>
      <Chevron width={16} height={16} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: theme.colors.white, fontSize: 14, fontWeight: "600" },
  count: { color: theme.colors.muted, fontWeight: "400" },
});
