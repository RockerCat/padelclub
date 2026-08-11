import { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { theme } from "../lib/theme";
import { addMinutes } from "../lib/time";

const NOTE_MAX_LENGTH = 500;

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

// Traducción 1:1 de AddExtraTimeModal.tsx (app web) — mismos dos inputs
// (minutos, valor), misma nota opcional, mismo preview en vivo (nueva hora
// de fin, valor adicional, nuevo total de la reserva), mismas validaciones
// de forma (minutos enteros > 0, valor >= 0). Puramente un formulario — no
// llama al servidor: el caller (ReservationTicketPanel) es dueño del
// pending/error y de la llamada real a addReservationExtraTime, misma
// división de responsabilidad que RejectReservationModal ya usa.
export function AddExtraTimeModal({
  visible,
  pending,
  error,
  startTime,
  currentDurationMinutes,
  currentEndTime,
  priceAmount,
  existingExtraAmount,
  currency,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  pending: boolean;
  error: string | null;
  startTime: string; // "HH:MM"
  currentDurationMinutes: number; // ya incluye cualquier extra previo
  currentEndTime: string; // "HH:MM" — precalculado por el caller
  priceAmount: number | null;
  existingExtraAmount: number;
  currency: string;
  onConfirm: (extraMinutes: number, extraAmount: number, note: string) => void;
  onCancel: () => void;
}) {
  const [minutesInput, setMinutesInput] = useState("");
  const [amountInput, setAmountInput] = useState("0");
  const [note, setNote] = useState("");

  const extraMinutes = parseInt(minutesInput, 10);
  const extraAmount = amountInput.trim() === "" ? 0 : Number(amountInput);
  const minutesValid = Number.isInteger(extraMinutes) && extraMinutes > 0;
  const amountValid = Number.isFinite(extraAmount) && extraAmount >= 0;
  const canSubmit = !pending && minutesValid && amountValid;

  const newEndTime = minutesValid ? addMinutes(startTime, currentDurationMinutes + extraMinutes) : null;
  const newTotal =
    priceAmount != null || existingExtraAmount > 0 || (amountValid && extraAmount > 0)
      ? (priceAmount ?? 0) + existingExtraAmount + (amountValid ? extraAmount : 0)
      : null;

  function handleClose() {
    if (pending) return;
    onCancel();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm(extraMinutes, extraAmount, note);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Agregar tiempo extra</Text>
            <TouchableOpacity onPress={handleClose} disabled={pending} style={styles.closeButton} hitSlop={8}>
              <X width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={styles.fieldLabel}>Minutos adicionales</Text>
              <TextInput
                value={minutesInput}
                onChangeText={setMinutesInput}
                editable={!pending}
                keyboardType="number-pad"
                placeholder="Ej. 25"
                placeholderTextColor="rgba(148,163,184,0.5)"
                style={styles.textInput}
                autoFocus
              />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Valor adicional ({currency})</Text>
              <TextInput
                value={amountInput}
                onChangeText={setAmountInput}
                editable={!pending}
                keyboardType="decimal-pad"
                style={styles.textInput}
              />
              <Text style={styles.hint}>Deja 0 si el club no va a cobrar la extensión.</Text>
            </View>

            <View>
              <Text style={styles.fieldLabel}>
                Nota <Text style={styles.fieldLabelOptional}>(opcional)</Text>
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                editable={!pending}
                multiline
                numberOfLines={2}
                maxLength={NOTE_MAX_LENGTH}
                placeholder="Ej. Extensión solicitada en recepción"
                placeholderTextColor="rgba(148,163,184,0.5)"
                style={[styles.textInput, styles.textArea]}
              />
            </View>

            <View style={styles.previewBox}>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Horario actual</Text>
                <Text style={styles.previewValue}>
                  {startTime} – {currentEndTime}
                </Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Nueva hora de finalización</Text>
                <Text style={[styles.previewValue, styles.previewValueStrong]}>{newEndTime ?? "—"}</Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Valor adicional</Text>
                <Text style={styles.previewValue}>{amountValid ? formatCurrency(extraAmount, currency) : "—"}</Text>
              </View>
              {newTotal != null && (
                <View style={[styles.previewRow, styles.previewTotalRow]}>
                  <Text style={styles.previewLabel}>Nuevo total de la reserva</Text>
                  <Text style={[styles.previewValue, styles.previewValueStrong]}>{formatCurrency(newTotal, currency)}</Text>
                </View>
              )}
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
              <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit} style={[styles.button, styles.buttonPrimary, !canSubmit && styles.buttonDisabled]}>
                {pending ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.buttonPrimaryText}>Agregar tiempo</Text>}
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
  fieldLabelOptional: { fontWeight: "400", textTransform: "none" },
  hint: { fontSize: 12, color: "rgba(148,163,184,0.6)", marginTop: 6 },
  textInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    color: theme.colors.white,
    fontSize: 15,
  },
  textArea: { height: 64, paddingTop: 10, textAlignVertical: "top" },
  previewBox: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  previewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewTotalRow: { paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  previewLabel: { fontSize: 13, color: theme.colors.muted },
  previewValue: { fontSize: 13, color: theme.colors.white },
  previewValueStrong: { fontWeight: "700" },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(248,113,113,0.05)", paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontSize: 13, color: theme.colors.danger },
  actionsRow: { flexDirection: "row", gap: 12, paddingTop: 4 },
  button: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonSecondary: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  buttonSecondaryText: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  buttonPrimary: { backgroundColor: theme.colors.primary },
  buttonPrimaryText: { fontSize: 14, fontWeight: "700", color: theme.colors.bg },
  buttonDisabled: { opacity: 0.4 },
});
