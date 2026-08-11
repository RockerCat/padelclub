import { StyleSheet, Text, View } from "react-native";
import { RESERVATION_STATUS } from "../lib/reservationStatus";
import type { MyReservation } from "../lib/playerReservations";
import { theme } from "../lib/theme";

export function StatusPill({ status }: { status: MyReservation["status"] }) {
  const cfg = RESERVATION_STATUS[status];
  return (
    <View style={[styles.pill, { borderColor: `${cfg.color}55`, backgroundColor: `${cfg.color}1A` }]}>
      <View style={[styles.dot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.label, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
