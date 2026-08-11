import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { durationOptions } from "../lib/durations";
import { RESERVATION_TYPE_LABELS } from "../lib/courtColors";
import { createReservationAdmin, updateReservationAdmin } from "../lib/reservationAdmin";
import { getAvailableSlotsAdmin, getReservationForEditAdmin } from "../lib/reservationEdit";
import { getReservationAdminEditPolicyNow } from "../../../shared/reservations/editPolicy";
import { WEEKDAY, MONTH } from "../lib/dateFormat";
import type { CalendarCourt, CalendarReservation, WeekDay } from "../lib/weekCalendar";

// Helpers de semana — misma implementación que ReservationsListScreen.tsx
// (getWeekMonday/addDays/toDateStr), duplicados a propósito acá (mismo
// criterio ya establecido en el proyecto para date helpers pequeños
// específicos de una pantalla/componente, ver mobile/src/lib/time.ts).
function getWeekMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Parseo local-safe (nunca new Date(dateStr) directo, que Hermes puede
// interpretar como UTC) — mismo criterio que formatShortDate (dateFormat.ts).
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type Member = { profile_id: string; full_name: string | null };

// Traducción 1:1 de ReservationForm.tsx (app web) — el mismo formulario
// sirve para crear Y editar (mode-switched, igual que la web vía
// editingReservationId): Cancha, Fecha, Hora (TimeSlotPicker real —
// horarios disponibles consultados en vivo, excluyendo la propia reserva
// al editar), Duración+Tipo, Título, Notas, Jugadores. Tipo/Título/Notas/
// Jugadores ahora también son editables en modo editar (update_reservation_admin,
// 20261106000001) — un cambio de alcance real de producto, no solo un
// desbloqueo de UI: la RPC vieja (update_reservation, PLAYER) sigue
// intacta y sin estos campos, este modal es exclusivamente OWNER/ADMIN. El
// toggle "Aceptar solicitudes" (is_open) sigue existiendo solo al crear —
// eso es responsabilidad exclusiva de set_reservation_open_status, un
// mecanismo aparte que este modal no toca.
export function WeekReservationModal({
  visible,
  mode,
  reservation,
  initialDate,
  initialCourtId,
  initialStartTime,
  weekDays,
  courts,
  members,
  allowedDurations,
  clubId,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  mode: "create" | "edit";
  reservation: CalendarReservation | null;
  initialDate?: string;
  initialCourtId?: string | null;
  // Prefill exacto del slot tocado (p. ej. desde el grid de Agenda) —
  // mismo criterio que WEB (ReservationTicketPanel pasa initialStartTime a
  // ReservationForm en modo crear): sigue siendo editable, el usuario
  // puede elegir otro horario del grid de disponibilidad si quiere.
  // undefined (el flujo "Nueva reserva" de Semana, sin slot tocado)
  // conserva el comportamiento de siempre: arranca vacío.
  initialStartTime?: string;
  weekDays: WeekDay[];
  courts: CalendarCourt[];
  members: Member[];
  allowedDurations: number[];
  clubId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = mode === "edit";
  const insets = useSafeAreaInsets();

  const [loadingEditData, setLoadingEditData] = useState(isEdit);
  const [courtId, setCourtId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [type, setType] = useState<string>("match");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [checkedPlayers, setCheckedPlayers] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsClosed, setSlotsClosed] = useState(false);

  // Valores REALES de la reserva tal como se cargaron (nunca el estado
  // editable de arriba, que sí cambia con cada tap) — la política de
  // edición por estado temporal (shared/reservations/editPolicy.ts) se
  // calcula una sola vez a partir de esto, igual que ReservationForm.tsx
  // (app web) hace con initialValues.
  const [originalSchedule, setOriginalSchedule] = useState<{ date: string; start_time: string; duration_minutes: number } | null>(null);

  // Semana propia del selector de Fecha en modo editar — independiente del
  // prop `weekDays` (que en create sigue siendo el rango que el caller ya
  // tenía visible, sin cambios). Antes de esto, editar solo ofrecía los
  // días que el caller ya tenía cargados (a veces un solo día, ver
  // ReservationDetailScreen.tsx) — con esto el selector siempre arranca en
  // la semana real de la reserva y se puede navegar libremente a cualquier
  // otra semana, igual que WEB permite cualquier fecha vía <input
  // type="date">, sin introducir una librería nueva ni una segunda regla
  // de fechas — reutiliza el mismo patrón de navegación por semana que
  // Semana (ReservationsListScreen.tsx) ya usa.
  const [editWeekAnchor, setEditWeekAnchor] = useState<Date | null>(null);

  // Carga inicial — igual que ReservationForm.tsx: en editar, los valores
  // reales vienen de getReservationForEdit (nunca de la fila ya cargada en
  // la lista de la semana, que no trae notes/player_ids); en crear, se
  // resetea a los valores iniciales del slot tocado.
  useEffect(() => {
    if (!visible) return;
    setError(null);

    if (mode === "edit" && reservation) {
      setLoadingEditData(true);
      getReservationForEditAdmin(supabase, reservation.id).then((data) => {
        if (!data) {
          setLoadingEditData(false);
          setError("No se pudo cargar la reserva.");
          return;
        }
        setCourtId(data.court_id);
        setDate(data.date);
        setStartTime(data.start_time.slice(0, 5));
        // Idéntico a defaultDuration en ReservationForm.tsx (app web): la
        // duración real solo se conserva si sigue entre las permitidas hoy
        // por el club — si el club la restringió después de crear esta
        // reserva (p. ej. permitía 90 min y ahora solo 60), cae a la
        // primera permitida, igual que la web. Sin este mismo fallback, el
        // cálculo de horarios disponibles usaría una duración distinta a
        // la que la web realmente usa para la misma reserva.
        setDuration(allowedDurations.includes(data.duration_minutes) ? data.duration_minutes : allowedDurations[0] ?? 60);
        setType(data.type);
        setTitle(data.title ?? "");
        setNotes(data.notes ?? "");
        setCheckedPlayers(new Set(data.player_ids));
        setOriginalSchedule({ date: data.date, start_time: data.start_time, duration_minutes: data.duration_minutes });
        setEditWeekAnchor(getWeekMonday(parseLocalDate(data.date)));
        setLoadingEditData(false);
      });
    } else {
      setCourtId(initialCourtId ?? courts[0]?.id ?? "");
      setDate(initialDate ?? weekDays[0]?.date ?? "");
      setStartTime(initialStartTime ?? "");
      setDuration(allowedDurations[0] ?? 60);
      setType("match");
      setTitle("");
      setNotes("");
      setCheckedPlayers(new Set());
      setIsOpen(false);
      setOriginalSchedule(null);
      setEditWeekAnchor(null);
      setLoadingEditData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, reservation?.id]);

  // Política de edición por estado temporal — solo aplica en modo editar
  // (crear siempre exige un horario futuro, la propia RPC lo rechaza si
  // no) y solo una vez cargado originalSchedule.
  const editPolicy = isEdit && originalSchedule
    ? getReservationAdminEditPolicyNow(originalSchedule.date, originalSchedule.start_time, originalSchedule.duration_minutes)
    : null;
  const scheduleLocked = !!editPolicy && !editPolicy.fields.court;
  const typeLocked = !!editPolicy && !editPolicy.fields.type;

  // Días reales de la semana de editWeekAnchor — mismo dayName/dayNum/
  // monthName que el resto de la app ya calcula (WEEKDAY/MONTH de
  // dateFormat.ts), nunca placeholders. Solo se usa en modo editar; create
  // sigue exactamente igual, consumiendo el prop `weekDays` sin cambios.
  const editWeekDays: WeekDay[] = editWeekAnchor
    ? Array.from({ length: 7 }, (_, i) => {
        const d = addDays(editWeekAnchor, i);
        return { date: toDateStr(d), dayName: WEEKDAY[d.getDay()], dayNum: d.getDate(), monthName: MONTH[d.getMonth()] };
      })
    : [];
  const dateOptions = isEdit ? editWeekDays : weekDays;

  // TimeSlotPicker — igual que ReservationForm.tsx: se recalcula en vivo
  // cada vez que cambia cancha/fecha/duración, excluyendo del conflicto la
  // propia reserva cuando se edita. Nunca se consulta cuando el horario
  // está congelado (reserva pasada) — no hay nada que reservar.
  useEffect(() => {
    if (!courtId || !date || loadingEditData || scheduleLocked) {
      setSlots([]);
      setSlotsLoading(false);
      setSlotsClosed(false);
      return;
    }
    setSlotsLoading(true);
    let cancelled = false;
    getAvailableSlotsAdmin(supabase, clubId, courtId, date, duration, isEdit ? reservation?.id : undefined).then(({ slots: s, closed }) => {
      if (cancelled) return;
      setSlots(s);
      setSlotsClosed(closed);
      setSlotsLoading(false);
      setStartTime((prev) => (s.includes(prev) ? prev : ""));
    });
    return () => {
      cancelled = true;
    };
  }, [courtId, date, duration, clubId, isEdit, reservation?.id, loadingEditData, scheduleLocked]);

  function togglePlayer(id: string) {
    setCheckedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!courtId) {
      setError("Selecciona una cancha.");
      return;
    }
    if (!startTime) {
      setError("Selecciona un horario disponible.");
      return;
    }
    if (type === "block" && !title.trim()) {
      setError("Un bloqueo necesita un título.");
      return;
    }

    setSubmitting(true);
    const result =
      isEdit && reservation
        ? await updateReservationAdmin(supabase, reservation.id, {
            courtId,
            date,
            startTime,
            durationMinutes: duration,
            type,
            title: title.trim() || null,
            notes: notes.trim() || null,
            playerIds: Array.from(checkedPlayers),
          })
        : await createReservationAdmin(supabase, {
            clubId,
            courtId,
            date,
            startTime,
            durationMinutes: duration,
            type,
            title: title.trim() || null,
            isOpen: isOpen && checkedPlayers.size < 4,
            playerIds: Array.from(checkedPlayers),
          });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  const durations = durationOptions(allowedDurations.length > 0 ? allowedDurations : [60, 90, 120]);
  const showPlayers = type !== "block";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{isEdit ? "Editar reserva" : "Nueva reserva"}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <X width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          {loadingEditData ? (
            <View style={styles.loadingBody}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
              <View style={scheduleLocked && styles.disabledField}>
                <Text style={styles.fieldLabel}>Cancha</Text>
                <View style={styles.pillRow}>
                  {courts.map((c) => (
                    <TouchableOpacity key={c.id} disabled={scheduleLocked} onPress={() => setCourtId(c.id)} style={[styles.pill, courtId === c.id && styles.pillActive]}>
                      <Text style={[styles.pillText, courtId === c.id && styles.pillTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={scheduleLocked && styles.disabledField}>
                <Text style={styles.fieldLabel}>Fecha</Text>
                {isEdit && !scheduleLocked && editWeekAnchor && (
                  <View style={styles.weekNavRow}>
                    <TouchableOpacity onPress={() => setEditWeekAnchor((p) => (p ? addDays(p, -7) : p))} style={styles.weekNavArrow} hitSlop={6}>
                      <ChevronLeft width={14} height={14} color={theme.colors.white} />
                    </TouchableOpacity>
                    <Text style={styles.weekNavLabel}>
                      {editWeekDays[0].dayNum} {editWeekDays[0].monthName} – {editWeekDays[6].dayNum} {editWeekDays[6].monthName}
                    </Text>
                    <TouchableOpacity onPress={() => setEditWeekAnchor((p) => (p ? addDays(p, 7) : p))} style={styles.weekNavArrow} hitSlop={6}>
                      <ChevronRight width={14} height={14} color={theme.colors.white} />
                    </TouchableOpacity>
                  </View>
                )}
                <View style={styles.pillRow}>
                  {dateOptions.map((d) => (
                    <TouchableOpacity key={d.date} disabled={scheduleLocked} onPress={() => setDate(d.date)} style={[styles.pill, date === d.date && styles.pillActive]}>
                      <Text style={[styles.pillText, date === d.date && styles.pillTextActive]}>
                        {d.dayName} {d.dayNum}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>Hora de inicio</Text>
                {scheduleLocked ? (
                  <View style={[styles.infoBox, styles.disabledField]}>
                    <Text style={styles.infoBoxText}>{startTime || "—"}</Text>
                  </View>
                ) : !courtId || !date ? (
                  <Text style={styles.helperText}>Selecciona cancha y fecha para ver horarios disponibles</Text>
                ) : slotsClosed ? (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoBoxText}>Club cerrado este día</Text>
                  </View>
                ) : slotsLoading ? (
                  <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
                ) : slots.length === 0 ? (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoBoxText}>No hay horarios disponibles para esta fecha.</Text>
                  </View>
                ) : (
                  <View style={styles.slotGrid}>
                    {slots.map((slot) => (
                      <TouchableOpacity
                        key={slot}
                        onPress={() => setStartTime(slot)}
                        style={[styles.slot, slot === startTime && styles.slotActive]}
                      >
                        <Text style={[styles.slotText, slot === startTime && styles.slotTextActive]}>{slot}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.row2}>
                <View style={[{ flex: 1 }, scheduleLocked && styles.disabledField]}>
                  <Text style={styles.fieldLabel}>Duración</Text>
                  <View style={styles.pillRow}>
                    {durations.map((d) => (
                      <TouchableOpacity key={d.minutes} disabled={scheduleLocked} onPress={() => setDuration(d.minutes)} style={[styles.pill, duration === d.minutes && styles.pillActive]}>
                        <Text style={[styles.pillText, duration === d.minutes && styles.pillTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={typeLocked && styles.disabledField}>
                <Text style={styles.fieldLabel}>Tipo</Text>
                <View style={styles.pillRow}>
                  {Object.entries(RESERVATION_TYPE_LABELS).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      disabled={typeLocked}
                      onPress={() => setType(value)}
                      style={[styles.pill, type === value && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, type === value && styles.pillTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {scheduleLocked && (
                <Text style={styles.disabledNotice}>
                  Esta reserva ya pasó — cancha, fecha, hora, duración y tipo quedan congelados. Solo puedes editar título, notas y jugadores.
                </Text>
              )}

              <View>
                <Text style={styles.fieldLabel}>
                  Título {type !== "block" && <Text style={styles.fieldLabelOptional}>(opcional)</Text>}
                </Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={type === "block" ? "Ej: Mantenimiento" : "Ej: Liga de verano"}
                  placeholderTextColor="rgba(148,163,184,0.5)"
                  style={styles.textInput}
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>
                  Notas <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Información adicional..."
                  placeholderTextColor="rgba(148,163,184,0.5)"
                  multiline
                  numberOfLines={2}
                  style={[styles.textInput, styles.textArea]}
                />
              </View>

              {showPlayers && (
                <View>
                  <Text style={styles.fieldLabel}>
                    Jugadores <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                  </Text>
                  {members.length === 0 ? (
                    <View style={styles.infoBox}>
                      <Text style={styles.infoBoxText}>No hay jugadores registrados todavía.</Text>
                    </View>
                  ) : (
                    <View style={styles.playersList}>
                      {members.map((m, i) => {
                        const checked = checkedPlayers.has(m.profile_id);
                        return (
                          <TouchableOpacity
                            key={m.profile_id}
                            onPress={() => togglePlayer(m.profile_id)}
                            style={[styles.playerRow, i < members.length - 1 && styles.playerRowBorder]}
                          >
                            <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
                            <Text style={styles.playerName}>{m.full_name ?? "Sin nombre"}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {!isEdit && type !== "block" && (
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.toggleTitle}>Aceptar solicitudes de jugadores</Text>
                    <Text style={styles.toggleHelp}>
                      {checkedPlayers.size >= 4
                        ? "4 o más jugadores siempre queda Cerrada."
                        : isOpen
                        ? "Otros jugadores del club podrán solicitar unirse a esta reserva."
                        : "Solo los jugadores que agregues aquí participarán en esta reserva."}
                    </Text>
                  </View>
                  <Switch
                    value={isOpen && checkedPlayers.size < 4}
                    onValueChange={setIsOpen}
                    disabled={checkedPlayers.size >= 4}
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

              <TouchableOpacity style={[styles.submitButton, submitting && styles.submitButtonDisabled]} disabled={submitting} onPress={handleSubmit} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.submitButtonText}>{isEdit ? "Guardar cambios" : "Crear reserva"}</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
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
  loadingBody: { paddingVertical: 60, alignItems: "center" },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  fieldLabelOptional: { fontWeight: "400", textTransform: "none" },
  disabledField: { opacity: 0.5 },
  weekNavRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  weekNavArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  weekNavLabel: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "600", color: theme.colors.white },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  pillActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  pillText: { fontSize: 13, color: theme.colors.muted },
  pillTextActive: { color: theme.colors.primary, fontWeight: "600" },
  row2: { flexDirection: "row", gap: 12 },
  helperText: { fontSize: 13, color: "rgba(148,163,184,0.5)", paddingVertical: 8 },
  infoBox: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.02)", paddingHorizontal: 16, paddingVertical: 12 },
  infoBoxText: { fontSize: 13, color: theme.colors.muted },
  // Sin maxHeight: crece según la cantidad real de horarios disponibles —
  // un maxHeight sin overflow:hidden aquí dejaba que las filas de más allá
  // del límite se pintaran fuera de la caja (visible por defecto en RN),
  // superponiéndose con la sección "Duración" que le sigue en el flujo.
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  slot: { flexBasis: "22%", flexGrow: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center" },
  slotActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  slotText: { fontSize: 12, fontWeight: "500", color: theme.colors.muted },
  slotTextActive: { color: theme.colors.bg, fontWeight: "700" },
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
  disabledNotice: { fontSize: 12, color: "rgba(148,163,184,0.7)", marginTop: -8 },
  // Sin maxHeight/overflow: con 5, 10 o más jugadores la lista completa
  // queda en el flujo vertical del formulario (el único scroll es el del
  // ScrollView raíz) — antes maxHeight:220 + overflow:"hidden" recortaba
  // silenciosamente el resto de la lista sin ofrecer ningún scroll propio.
  playersList: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)" },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  playerRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  checkbox: { width: 18, height: 18, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.15)" },
  checkboxChecked: { backgroundColor: theme.colors.primary },
  playerName: { fontSize: 14, color: theme.colors.white },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)" },
  toggleTitle: { fontSize: 14, fontWeight: "500", color: theme.colors.white },
  toggleHelp: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(248,113,113,0.05)", paddingHorizontal: 12, paddingVertical: 8 },
  errorText: { fontSize: 14, color: theme.colors.danger, textAlign: "center" },
  submitButton: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: theme.colors.primary },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: 14, fontWeight: "700", color: theme.colors.bg },
});
