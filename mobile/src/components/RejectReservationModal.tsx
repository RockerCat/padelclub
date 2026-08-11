import { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { theme } from "../lib/theme";
import { REJECTION_REASONS, REJECTION_COMMENT_MAX_LENGTH, type RejectionReasonCode } from "../lib/reservationRejection";

// Traducción 1:1 de RejectReservationModal.tsx (app web) — mismo catálogo
// de motivos (shared/reservations/rejection.ts), mismo comportamiento
// (comentario obligatorio solo para "Otro motivo"), mismo bottom sheet.
// Reutilizado tanto por PendingRequestCard (lista "Solicitudes
// pendientes") como por ReservationTicketPanel (modo pendiente al tocar un
// slot ocupado en Agenda) — un solo modal, no dos.
export function RejectReservationModal({
  visible,
  pending,
  error,
  onConfirm,
  onCancel,
  onDismiss,
}: {
  visible: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: (reasonCode: RejectionReasonCode, comment: string) => void;
  onCancel: () => void;
  // Confirmación real de RN (iOS) de que la presentación nativa de ESTE
  // modal ya terminó de cerrarse — nunca disparado por onCancel/onConfirm
  // en sí, sino por el propio <Modal> una vez que `visible` pasó a false y
  // la animación de salida terminó. Opcional: un caller que no necesita
  // coordinar su propio cierre con este (p. ej. PendingRequestCard, que
  // nunca anida este modal dentro de otro) simplemente no lo pasa.
  onDismiss?: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode>(REJECTION_REASONS[0].code);
  const [comment, setComment] = useState("");

  const isOther = reasonCode === "other";
  const trimmedComment = comment.trim();
  const canSubmit = !pending && (!isOther || trimmedComment.length > 0);

  function handleClose() {
    if (pending) return;
    onCancel();
  }

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm(reasonCode, comment);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} onDismiss={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Rechazar solicitud</Text>
            <TouchableOpacity onPress={handleClose} disabled={pending} style={styles.closeButton} hitSlop={8}>
              <X width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={styles.fieldLabel}>Motivo</Text>
              <View style={{ gap: 8 }}>
                {REJECTION_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.code}
                    onPress={() => setReasonCode(r.code)}
                    disabled={pending}
                    style={[styles.reasonRow, reasonCode === r.code && styles.reasonRowActive]}
                  >
                    <View style={[styles.radio, reasonCode === r.code && styles.radioActive]} />
                    <Text style={[styles.reasonText, reasonCode === r.code && styles.reasonTextActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>{isOther ? "Explica el motivo (obligatorio)" : "Comentario adicional (opcional)"}</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                editable={!pending}
                multiline
                numberOfLines={3}
                maxLength={REJECTION_COMMENT_MAX_LENGTH}
                placeholder={isOther ? "Escribe el motivo del rechazo…" : "Agrega detalles para el jugador…"}
                placeholderTextColor="rgba(148,163,184,0.5)"
                style={[styles.textInput, styles.textArea]}
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={handleClose} disabled={pending} style={[styles.button, styles.buttonSecondary]}>
                <Text style={styles.buttonSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={!canSubmit}
                style={[styles.button, styles.buttonDanger, !canSubmit && styles.buttonDisabled]}
              >
                {pending ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.buttonDangerText}>Rechazar reserva</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 0,
    maxHeight: "92%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  closeButton: { padding: 6, borderRadius: 8 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  reasonRowActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" },
  radioActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  reasonText: { fontSize: 14, color: theme.colors.muted, flexShrink: 1 },
  reasonTextActive: { color: theme.colors.white },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.white,
    fontSize: 14,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(248,113,113,0.05)", paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontSize: 13, color: theme.colors.danger },
  actionsRow: { flexDirection: "row", gap: 12, paddingTop: 4 },
  button: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonSecondary: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  buttonSecondaryText: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  buttonDanger: { backgroundColor: theme.colors.danger },
  buttonDangerText: { fontSize: 14, fontWeight: "700", color: theme.colors.white },
  buttonDisabled: { opacity: 0.4 },
});
