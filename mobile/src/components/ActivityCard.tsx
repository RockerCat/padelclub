import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import type { MyReservation } from "../lib/playerReservations";
import { RESERVATION_STATUS } from "../lib/reservationStatus";
import { formatShortDate } from "../lib/dateFormat";
import { addMinutes } from "../lib/time";
import { durationLabel } from "../lib/durations";
import { canPlayerCancelReservation } from "../lib/reservationActivity";
import { buildReservationSlug } from "../lib/reservationSlug";
import { buildReservationShareMessage, SITE_URL } from "../lib/reservationShare";
import { cancelReservation } from "../lib/cancelReservation";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { ShareActions } from "./ShareActions";

// Traducción 1:1 de ActivityCard en src/components/reservations/PlayerActivity.tsx
// (app web) — mismo layout/spacing exacto:
//   rounded-lg(8) border px-3(12) py-2.5(10) pr-7(28)
//   pill: gap-1(4) px-1.5(6) py-0.5(2) rounded-full text-[10px] font-medium
//   dot: w-1 h-1(4x4)
//   fecha: text-xs(12) font-medium mt-1.5(6) capitalize truncate
//   meta: text-[11px](11) mt-0.5(2) truncate
//   motivo rechazo: text-[11px](11) mt-1(4) line-clamp-2
//   fila acciones: mt-2 pt-2(8/8) border-t border-white/5 gap-4(16)
//   dismiss: top-2 right-2(8/8) p-0.5(2), ícono X w-3 h-3(12)
// "Editar reserva" no se replica — en la web navega al calendario de
// disponibilidad para elegir un nuevo horario (módulo de booking/edición
// completo), explícitamente fuera de alcance de este slice; ver reporte.
export function ActivityCard({
  reservation,
  clubSlug,
  clubName,
  viewerId,
  onPress,
  onDismiss,
  onCancelled,
}: {
  reservation: MyReservation;
  clubSlug: string;
  clubName?: string;
  viewerId: string;
  onPress: () => void;
  onDismiss: (id: string) => void;
  onCancelled: () => void;
}) {
  const cfg = RESERVATION_STATUS[reservation.status];
  const start = reservation.start_time.slice(0, 5);
  const end = addMinutes(start, reservation.duration_minutes);
  const isRejected = reservation.status === "rejected";
  const isCreator = reservation.created_by === viewerId;
  const isCancellableState = reservation.status === "pending" || reservation.status === "confirmed";
  const canCancelNow = isCancellableState && canPlayerCancelReservation(reservation);
  const [cancelling, setCancelling] = useState(false);

  const shareSlug = buildReservationSlug({
    creatorName: null,
    date: reservation.date,
    startTime: reservation.start_time,
    id: reservation.id,
  });
  const shareUrl = `${SITE_URL}/${clubSlug}/reservations/${shareSlug}`;
  const shareMessage = buildReservationShareMessage({
    clubName: clubName ?? clubSlug,
    creatorName: reservation.creator_name,
    date: reservation.date,
    startTime: reservation.start_time,
    durationMinutes: reservation.duration_minutes,
    courtName: reservation.courtName,
    isOpen: reservation.is_open,
    playerCount: reservation.reservation_players_count + (isCreator ? 1 : 0),
    url: shareUrl,
  });

  function handleCancelPress() {
    Alert.alert(
      "Cancelar reserva",
      `¿Seguro que quieres cancelar tu reserva del ${formatShortDate(reservation.date)} de ${start} a ${end}? Esta acción no se puede deshacer.`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Sí, cancelar",
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

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      {isRejected && (
        <TouchableOpacity onPress={() => onDismiss(reservation.id)} accessibilityLabel="Cerrar tarjeta" hitSlop={8} style={styles.dismissButton}>
          <X width={12} height={12} color="rgba(148,163,184,0.5)" />
        </TouchableOpacity>
      )}

      <View style={[styles.pill, { borderColor: `${cfg.color}33`, backgroundColor: `${cfg.color}1A` }]}>
        <View style={[styles.dot, { backgroundColor: cfg.color }]} />
        <Text style={[styles.pillLabel, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      <Text style={styles.date} numberOfLines={1}>
        {formatShortDate(reservation.date)}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {reservation.courtName} · {start}–{end} · {durationLabel(reservation.duration_minutes)}
      </Text>

      {isRejected && reservation.rejection_reason && (
        <Text style={styles.rejectionReason} numberOfLines={2}>
          {reservation.rejection_reason}
        </Text>
      )}

      {isCancellableState && (
        <View style={styles.actionsRow}>
          {canCancelNow ? (
            cancelling ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <TouchableOpacity onPress={handleCancelPress} hitSlop={8}>
                <Text style={styles.cancelAction}>Cancelar reserva</Text>
              </TouchableOpacity>
            )
          ) : (
            <Text style={styles.windowClosed}>
              {isCreator
                ? "Ya no se puede editar ni cancelar (faltan menos de 2 horas)"
                : "Ya no se puede cancelar (faltan menos de 2 horas)"}
            </Text>
          )}
        </View>
      )}

      {isCreator && reservation.status === "confirmed" && (
        <View style={styles.shareRow}>
          <ShareActions url={shareUrl} message={shareMessage} compact />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 28,
  },
  dismissButton: { position: "absolute", top: 8, right: 8, padding: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  pillLabel: { fontSize: 10, fontWeight: "500" },
  date: { color: theme.colors.white, fontSize: 12, fontWeight: "500", marginTop: 6, textTransform: "capitalize" },
  meta: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  rejectionReason: { color: "#F87171E6", fontSize: 11, marginTop: 4 },
  actionsRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  cancelAction: { fontSize: 11, fontWeight: "500", color: theme.colors.danger },
  windowClosed: { fontSize: 11, color: "rgba(148,163,184,0.6)" },
  shareRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
});
