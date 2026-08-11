import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { cancelReservation } from "../lib/cancelReservation";
import { courtColor, RESERVATION_TYPE_LABELS } from "../lib/courtColors";
import { addMinutes } from "../lib/time";
import { theme } from "../lib/theme";
import type { CalendarReservation } from "../lib/weekCalendar";

// Traducción 1:1 del ticket de MobileDayList en WeekCalendar.tsx (app
// web): rounded-xl p-4 pr-12 border-l-[3px], acento/fondo por color de
// cancha (courtColor), hora en negrita color acento + duración en gris,
// cancha en blanco negrita, línea "Tipo · título" (o solo Tipo si no hay
// título), línea de jugadores si aplica. Tocar la tarjeta = editar
// directo; "⋮" abre Editar/Cancelar — mismo criterio que la web, solo que
// vía Alert.alert nativo en vez de un dropdown CSS.
export function WeekReservationCard({
  reservation,
  colorIndex,
  onEdit,
  onCancelled,
}: {
  reservation: CalendarReservation;
  colorIndex: number;
  onEdit: () => void;
  onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const color = courtColor(colorIndex);
  const start = reservation.start_time.slice(0, 5);
  const end = addMinutes(start, reservation.duration_minutes);
  const typeLabel = RESERVATION_TYPE_LABELS[reservation.type] ?? reservation.type;
  const thirdLine = reservation.title ? `${typeLabel} · ${reservation.title}` : typeLabel;

  function handleCancelConfirm() {
    Alert.alert(
      "¿Cancelar esta reserva?",
      `${reservation.courtName} · ${reservation.date} · ${start}\n\nEsta acción liberará el horario de la cancha.`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Confirmar",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            const result = await cancelReservation(supabase, reservation.id);
            setCancelling(false);
            if (result.error) {
              Alert.alert("No se pudo cancelar", result.error);
              return;
            }
            onCancelled();
          },
        },
      ]
    );
  }

  function handleMenuPress() {
    Alert.alert(`${reservation.courtName} · ${start}`, undefined, [
      { text: "Editar", onPress: onEdit },
      { text: "Cancelar reserva", style: "destructive", onPress: handleCancelConfirm },
      { text: "Cerrar", style: "cancel" },
    ]);
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: color.bg, borderLeftColor: color.accent }]}
      onPress={onEdit}
      activeOpacity={0.8}
    >
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: color.accent }]}>
          {start} – {end}
        </Text>
        <Text style={styles.duration}>{reservation.duration_minutes} min</Text>
      </View>
      <Text style={styles.court}>{reservation.courtName}</Text>
      <Text style={styles.typeLine}>{thirdLine}</Text>
      {reservation.players.length > 0 && (
        <Text style={styles.playersLine} numberOfLines={1}>
          {reservation.players.join(", ")}
        </Text>
      )}

      {cancelling ? (
        <ActivityIndicator size="small" color={theme.colors.danger} style={styles.menuButton} />
      ) : (
        <TouchableOpacity onPress={handleMenuPress} style={styles.menuButton} hitSlop={8}>
          <MoreVertical width={18} height={18} color={theme.colors.muted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 16,
    paddingRight: 44,
    gap: 2,
  },
  timeRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  time: { fontSize: 15, fontWeight: "700" },
  duration: { fontSize: 12, color: theme.colors.muted },
  court: { fontSize: 14, fontWeight: "700", color: theme.colors.white, marginTop: 2 },
  typeLine: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  playersLine: { fontSize: 12, color: "rgba(148,163,184,0.7)", marginTop: 4 },
  menuButton: { position: "absolute", top: 14, right: 12, padding: 4 },
});
