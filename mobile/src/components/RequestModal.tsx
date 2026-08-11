import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { addMinutes } from "../lib/time";
import { formatModalDate } from "../lib/dateFormat";
import { durationOptions, durationLabel } from "../lib/durations";
import { resolveReservationPrice, type ResolveReservationPriceResult } from "../lib/reservationPricing";
import { requestReservation, updateMyReservation } from "../lib/reservationMutations";

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export type ModalSlot = { courtId: string; courtName: string; date: string; startTime: string; duration?: number };

// Traducción 1:1 de RequestModal (inline en PlayerAvailabilityCalendar.tsx,
// app web) — mismo contenido y orden exacto: header, resumen cancha/fecha/
// hora, pills de duración, preview de hora fin, card de precio (loading/
// matched/no disponible), toggle "aceptar solicitudes" (solo crear),
// error, botón enviar, caption. En mobile web es un bottom sheet
// (`items-end`, `rounded-t-2xl`) — acá es el mismo patrón con el `Modal`
// nativo de RN (animationType="slide", transparent), que es el
// equivalente nativo real de un bottom sheet, en vez de un modal centrado.
export function RequestModal({
  visible,
  slot,
  clubId,
  allowedDurations,
  editingReservationId,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  slot: ModalSlot | null;
  clubId: string;
  allowedDurations: number[];
  editingReservationId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditMode = !!editingReservationId;
  const [duration, setDuration] = useState<number>(slot?.duration ?? allowedDurations[0] ?? 60);
  const [isOpen, setIsOpen] = useState(false);
  const [price, setPrice] = useState<{ key: string; result: ResolveReservationPriceResult | null }>({ key: "", result: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slot) setDuration(slot.duration ?? allowedDurations[0] ?? 60);
    setIsOpen(false);
    setError(null);
  }, [slot, allowedDurations]);

  const requestKey = slot ? `${clubId}|${slot.courtId}|${slot.date}|${slot.startTime}|${duration}` : "";

  useEffect(() => {
    if (!slot) return;
    let cancelled = false;
    resolveReservationPrice(supabase, {
      clubId,
      courtId: slot.courtId,
      date: slot.date,
      startTime: slot.startTime,
      durationMinutes: duration,
    }).then((result) => {
      if (!cancelled) setPrice({ key: requestKey, result });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  if (!slot) return null;

  const priceLoading = price.key !== requestKey;
  const priceResult = priceLoading ? null : price.result;
  const endTime = addMinutes(slot.startTime, duration);
  const durations = durationOptions(allowedDurations);

  async function handleSubmit() {
    if (!slot) return;
    setError(null);
    setSubmitting(true);
    const result = isEditMode
      ? await updateMyReservation(supabase, editingReservationId!, {
          courtId: slot.courtId,
          date: slot.date,
          startTime: slot.startTime,
          durationMinutes: duration,
        })
      : await requestReservation(supabase, {
          clubId,
          courtId: slot.courtId,
          date: slot.date,
          startTime: slot.startTime,
          durationMinutes: duration,
          isOpen,
        });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{isEditMode ? "Editar reserva" : "Solicitar reserva"}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
                <X width={16} height={16} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cancha</Text>
                  <Text style={styles.summaryValue}>{slot.courtName}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Fecha</Text>
                  <Text style={[styles.summaryValue, { textTransform: "capitalize" }]}>{formatModalDate(slot.date)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Hora</Text>
                  <Text style={styles.summaryValue}>
                    {slot.startTime} – {endTime}
                  </Text>
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>Duración</Text>
                <View style={styles.durationGrid}>
                  {durations.map((d) => (
                    <TouchableOpacity
                      key={d.minutes}
                      onPress={() => setDuration(d.minutes)}
                      style={[styles.durationPill, duration === d.minutes && styles.durationPillActive]}
                    >
                      <Text style={[styles.durationPillText, duration === d.minutes && styles.durationPillTextActive]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text style={styles.endTimePreview}>
                Reserva de <Text style={{ fontWeight: "700" }}>{slot.startTime} a {endTime}</Text>
              </Text>

              <View style={styles.priceCard}>
                {priceLoading ? (
                  <View style={styles.priceLoadingRow}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={styles.priceMuted}>Calculando precio…</Text>
                  </View>
                ) : priceResult?.matched ? (
                  <View style={{ gap: 6 }}>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceMuted}>Tarifa aplicada</Text>
                      <Text style={styles.priceValue}>{priceResult.ruleName}</Text>
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceMuted}>Duración</Text>
                      <Text style={styles.priceValue}>{durationLabel(priceResult.durationMinutes)}</Text>
                    </View>
                    <View style={[styles.priceRow, styles.priceTotalRow]}>
                      <Text style={styles.priceTotalLabel}>Valor de la reserva</Text>
                      <Text style={styles.priceTotalValue}>{formatCurrency(priceResult.finalPrice, priceResult.currency)}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.priceMuted}>Precio no disponible para este horario.</Text>
                )}
              </View>

              {!isEditMode && (
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.toggleTitle}>Aceptar solicitudes de jugadores</Text>
                    <Text style={styles.toggleHelp}>
                      {isOpen
                        ? "Otros jugadores del club podrán solicitar unirse una vez la reserva sea aprobada. Tú decidirás si aceptarlos."
                        : "Solo tú podrás participar inicialmente en esta reserva."}
                    </Text>
                  </View>
                  <Switch
                    value={isOpen}
                    onValueChange={setIsOpen}
                    trackColor={{ true: theme.colors.primary, false: "rgba(255,255,255,0.15)" }}
                    thumbColor={theme.colors.white}
                  />
                </View>
              )}

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitButton, (submitting || priceLoading || !priceResult?.matched) && styles.submitButtonDisabled]}
                disabled={submitting || priceLoading || !priceResult?.matched}
                onPress={handleSubmit}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.bg} />
                ) : (
                  <Text style={styles.submitButtonText}>{isEditMode ? "Guardar cambios" : "Enviar solicitud"}</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.caption}>
                {isEditMode
                  ? "Si tu reserva ya estaba confirmada, un cambio de horario puede requerir nueva aprobación del club."
                  : "Tu solicitud quedará pendiente de aprobación por el administrador."}
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheetWrap: { width: "100%" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 0,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  closeButton: { padding: 6, borderRadius: 8 },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 16 },
  summary: { gap: 8, paddingTop: 4, paddingBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14, color: theme.colors.muted },
  summaryValue: { fontSize: 14, color: theme.colors.white, fontWeight: "500" },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  durationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  durationPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  durationPillActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  durationPillText: { fontSize: 13, color: theme.colors.muted },
  durationPillTextActive: { color: theme.colors.primary, fontWeight: "600" },
  endTimePreview: { fontSize: 12, color: theme.colors.muted, textAlign: "center" },
  priceCard: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", padding: 12 },
  priceLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  priceRow: { flexDirection: "row", justifyContent: "space-between" },
  priceMuted: { fontSize: 13, color: theme.colors.muted },
  priceValue: { fontSize: 13, color: theme.colors.white },
  priceTotalRow: { paddingTop: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  priceTotalLabel: { fontSize: 13, fontWeight: "700", color: theme.colors.white },
  priceTotalValue: { fontSize: 14, fontWeight: "700", color: theme.colors.primary },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  toggleTitle: { fontSize: 14, fontWeight: "500", color: theme.colors.white },
  toggleHelp: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.2)",
    backgroundColor: "rgba(248,113,113,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: { fontSize: 14, color: theme.colors.danger, textAlign: "center" },
  submitButton: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: theme.colors.primary },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: 14, fontWeight: "700", color: theme.colors.bg },
  caption: { fontSize: 12, color: theme.colors.muted, textAlign: "center", lineHeight: 18 },
});
