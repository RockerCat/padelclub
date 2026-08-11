import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Check, Eye, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { durationLabel } from "../lib/durations";
import { addMinutes } from "../lib/time";
import { formatShortDate } from "../lib/dateFormat";
import {
  approvePendingReservation,
  rejectPendingReservation,
  type PendingRequest,
  type PendingActionResult,
} from "../lib/reservationAdminRequests";
import type { RejectionReasonCode } from "../lib/reservationRejection";
import { RejectReservationModal } from "./RejectReservationModal";

// Ya procesada por otro admin — mismo string exacto que actions.ts (app
// web) devuelve, detectado solo para reaccionar (cerrar el modal, dejar
// que onDone recargue el estado real), nunca para reimplementar la
// decisión acá.
const ALREADY_RESOLVED_ERROR = "La solicitud ya fue procesada.";

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

// Traducción 1:1 de PendingCard (dentro de PendingRequestsSection.tsx, app
// web) — mismos datos, mismas RPCs (approvePendingReservation/
// rejectPendingReservation), mismo orden de acciones Revisar/Rechazar/
// Confirmar. "Revisar" abre el mismo ReservationTicketPanel (modo
// "pending") que ya se usa al tocar un slot pendiente en Agenda — el
// equivalente nativo de la página PendingReservationReview de la web
// (mismos datos, mismas acciones Confirmar/Rechazar), en vez de una
// segunda pantalla de detalle.
export function PendingRequestCard({
  request,
  clubId,
  onDone,
  onReview,
}: {
  request: PendingRequest;
  clubId: string;
  onDone: () => void;
  onReview: (request: PendingRequest) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const isPending = approving || rejecting;

  async function handleApprove() {
    setError(null);
    setApproving(true);
    const result: PendingActionResult = await approvePendingReservation(supabase, request.id);
    setApproving(false);
    if (result.success) onDone();
    else setError(result.error ?? "Error al confirmar.");
  }

  async function handleRejectConfirm(reasonCode: RejectionReasonCode, comment: string) {
    setRejectError(null);
    setRejecting(true);
    const result: PendingActionResult = await rejectPendingReservation(supabase, clubId, request.id, reasonCode, comment);
    setRejecting(false);
    if (result.success) {
      setRejectModalOpen(false);
      onDone();
      return;
    }
    if (result.error === ALREADY_RESOLVED_ERROR) {
      setRejectModalOpen(false);
      setError(result.error);
      onDone();
      return;
    }
    setRejectError(result.error ?? "Error al rechazar.");
  }

  const start = request.start_time.slice(0, 5);
  const end = addMinutes(start, request.duration_minutes);

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{request.playerName ?? "Jugador"}</Text>
      <Text style={styles.meta}>
        {formatShortDate(request.date)} · {request.courtName}
      </Text>
      <Text style={styles.meta}>
        {start} – {end} · {durationLabel(request.duration_minutes)}
      </Text>
      {request.price_amount != null && request.price_currency && (
        <Text style={styles.price}>Valor: {formatCurrency(request.price_amount, request.price_currency)}</Text>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={() => onReview(request)} disabled={isPending} style={[styles.actionButton, styles.reviewButton]}>
          <Eye width={14} height={14} color={theme.colors.muted} />
          <Text style={styles.reviewButtonText}>Revisar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setRejectModalOpen(true)} disabled={isPending} style={[styles.actionButton, styles.rejectButton]}>
          {rejecting ? <ActivityIndicator size="small" color={theme.colors.muted} /> : <X width={14} height={14} color={theme.colors.muted} />}
          <Text style={styles.rejectButtonText}>Rechazar</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={handleApprove} disabled={isPending} style={[styles.approveButton, styles.approveButtonFull]}>
        {approving ? <ActivityIndicator size="small" color={theme.colors.bg} /> : <Check width={14} height={14} color={theme.colors.bg} />}
        <Text style={styles.approveButtonText}>Confirmar</Text>
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <RejectReservationModal
        visible={rejectModalOpen}
        pending={rejecting}
        error={rejectError}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 16, gap: 2 },
  name: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  meta: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
  price: { fontSize: 13, fontWeight: "600", color: theme.colors.white, marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 10 },
  reviewButton: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  reviewButtonText: { fontSize: 13, fontWeight: "600", color: theme.colors.muted },
  rejectButton: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  rejectButtonText: { fontSize: 13, fontWeight: "600", color: theme.colors.muted },
  approveButton: { backgroundColor: theme.colors.success, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 10 },
  approveButtonFull: { marginTop: 8 },
  approveButtonText: { fontSize: 13, fontWeight: "700", color: theme.colors.bg },
  errorText: { fontSize: 12, color: theme.colors.danger, marginTop: 8 },
});
