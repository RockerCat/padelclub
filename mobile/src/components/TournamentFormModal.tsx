import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ImageIcon, Pencil, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { getBogotaWallClockNow, bogotaWallClockToISO, isoToBogotaWallClock } from "../lib/bogotaDatetime";
import {
  createTournament,
  updateTournament,
  defaultEstimatedDurationMinutes,
  hoursInputToMinutes,
  minutesToHoursInputValue,
  isStructuralFieldsLocked,
  type SportCategoryOption,
} from "../lib/tournaments";
import type { Tournament } from "../types/domain";

// Traducción 1:1 del formulario compartido de creación/edición
// (TournamentForm.tsx, app web) — mismos campos, mismos defaults, mismo
// autocompletado (cierre de inscripciones sigue a inicio mientras no se
// edite manualmente; duración estimada se recalcula desde el cupo
// mientras no se edite manualmente), mismo structuralFieldsLocked
// (categoría/categoría secundaria/apertura de inscripciones se congelan
// en solo-lectura una vez registration_open o registration_closed —
// nunca un <select disabled>, un <View> de solo lectura real que no
// puede resetearse), mismo minMaxPairs = duplas activas al editar. Web
// usa <input type="datetime-local">; mobile no tiene ese control nativo,
// así que cada fecha es un TextInput de texto libre "YYYY-MM-DD HH:mm" —
// misma hora de pared de Bogotá, mismo bogotaWallClockToISO, solo cambia
// el widget de captura (presentación).
//
// Portada (modo editar): web muestra TournamentImageUpload inline dentro
// de este mismo form, con currentImageUrl={tournament?.cover_image_url}
// — acá se muestra el mismo preview (tournament.cover_image_url, visible
// desde el primer render, sin estado propio que pueda arrancar vacío) más
// un botón "Editar portada" que delega a onEditCover, nunca una segunda
// implementación del picker/upload — eso sigue viviendo enteramente en
// EditTournamentCoverModal/tournamentCoverUpload.ts (subir, reemplazar,
// quitar, guardar). onEditCover nunca abre ese modal ANIDADO dentro de
// este (dos <Modal> de RN cerrándose a la vez es exactamente la causa
// confirmada de un freeze real en otro flujo, ver ReservationTicketPanel)
// — el caller (TournamentDetailScreen) lo recibe y hace swap: cierra este
// modal y abre EditTournamentCoverModal como hermano, nunca anidado.
// Guardar este form (updateTournament) nunca incluye cover_image_url en
// sus fields, así que guardar sin tocar la portada nunca la altera.

function spaceToWallClock(v: string): string {
  return v.trim().replace(" ", "T");
}
function isoToSpaceWallClock(iso: string | null): string {
  return isoToBogotaWallClock(iso).replace("T", " ");
}

export function TournamentFormModal({
  clubId,
  tournament,
  categories,
  minMaxPairs = 1,
  onClose,
  onSuccess,
  onEditCover,
}: {
  clubId: string;
  tournament?: Tournament;
  categories: SportCategoryOption[];
  minMaxPairs?: number;
  onClose: () => void;
  onSuccess: (tournament: Tournament) => void;
  // Modo editar únicamente — abre EditTournamentCoverModal (reemplazar/
  // quitar portada), reutilizando ese flujo existente en vez de duplicar
  // su lógica acá. undefined en modo crear (TournamentsScreen no lo pasa;
  // un torneo recién creado no tiene portada que editar todavía).
  onEditCover?: () => void;
}) {
  const isEdit = !!tournament;
  const structuralFieldsLocked = !!tournament && isStructuralFieldsLocked(tournament.status);
  const effectiveMinMaxPairs = Math.max(2, minMaxPairs);

  const [name, setName] = useState(tournament?.name ?? "");
  const [description, setDescription] = useState(tournament?.description ?? "");
  const [categoryCode, setCategoryCode] = useState(tournament?.category ?? "");
  const [secondaryCategoryCode, setSecondaryCategoryCode] = useState(tournament?.secondary_category ?? "");
  const initialMaxPairs = tournament?.max_pairs ?? 8;
  const [maxPairsInput, setMaxPairsInput] = useState(String(initialMaxPairs));
  const [entryFeeAmountInput, setEntryFeeAmountInput] = useState(String(tournament?.entry_fee_amount ?? 0));
  const [visibility, setVisibility] = useState<"private" | "public">((tournament?.visibility as "private" | "public") ?? "private");
  const [prizeInput, setPrizeInput] = useState(isEdit ? tournament!.prize_description ?? "" : "🥇 1er lugar:\n🥈 2do lugar:");

  const [registrationOpensAtInput, setRegistrationOpensAtInput] = useState(() =>
    isEdit ? isoToSpaceWallClock(tournament!.registration_opens_at) : getBogotaWallClockNow()
  );
  const [startsAtInput, setStartsAtInput] = useState(() => isoToSpaceWallClock(tournament?.starts_at ?? null));
  const [registrationClosesAtInput, setRegistrationClosesAtInput] = useState(() =>
    isoToSpaceWallClock(tournament?.registration_closes_at ?? null)
  );
  const [closesAtTouched, setClosesAtTouched] = useState(isEdit);

  const [durationHoursInput, setDurationHoursInput] = useState(() =>
    minutesToHoursInputValue(tournament?.estimated_duration_minutes ?? defaultEstimatedDurationMinutes(initialMaxPairs))
  );
  const [durationTouched, setDurationTouched] = useState(isEdit);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primarySortOrder = categories.find((c) => c.code === categoryCode)?.sort_order;
  const secondaryOptions = categories.filter((c) => primarySortOrder !== undefined && c.sort_order < primarySortOrder);

  function handleCategoryChange(code: string) {
    setCategoryCode(code);
    const newSortOrder = categories.find((c) => c.code === code)?.sort_order;
    const stillValid = secondaryCategoryCode
      ? categories.some((c) => c.code === secondaryCategoryCode && newSortOrder !== undefined && c.sort_order < newSortOrder)
      : true;
    if (!stillValid) setSecondaryCategoryCode("");
  }

  function handleStartsAtChange(value: string) {
    setStartsAtInput(value);
    if (!isEdit && !closesAtTouched) setRegistrationClosesAtInput(value);
  }

  function handleClosesAtChange(value: string) {
    setRegistrationClosesAtInput(value);
    setClosesAtTouched(true);
  }

  function handleMaxPairsChange(value: string) {
    setMaxPairsInput(value);
    const parsed = parseInt(value, 10);
    if (!durationTouched && Number.isInteger(parsed) && parsed > 0) {
      setDurationHoursInput(minutesToHoursInputValue(defaultEstimatedDurationMinutes(parsed)));
    }
  }

  function handleDurationHoursChange(value: string) {
    setDurationHoursInput(value);
    setDurationTouched(true);
  }

  async function handleSubmit() {
    const maxPairs = parseInt(maxPairsInput, 10);
    if (!Number.isInteger(maxPairs) || maxPairs < effectiveMinMaxPairs) {
      setError(
        isEdit
          ? `El cupo máximo no puede ser menor que las ${effectiveMinMaxPairs} duplas activas registradas.`
          : "Un torneo debe permitir al menos 2 duplas."
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    const fields = {
      name,
      description: description.trim() || null,
      category: categoryCode,
      secondaryCategory: secondaryCategoryCode || null,
      maxPairs,
      visibility,
      registrationOpensAt: bogotaWallClockToISO(spaceToWallClock(registrationOpensAtInput)),
      registrationClosesAt: bogotaWallClockToISO(spaceToWallClock(registrationClosesAtInput)),
      startsAt: bogotaWallClockToISO(spaceToWallClock(startsAtInput)),
      estimatedDurationMinutes: hoursInputToMinutes(durationHoursInput),
      prizeDescription: prizeInput.trim() || null,
      entryFeeAmount: parseInt(entryFeeAmountInput, 10) || 0,
    };
    const { tournament: result, error: rpcError } = isEdit
      ? await updateTournament(supabase, tournament!.id, fields)
      : await createTournament(supabase, clubId, fields);
    setSubmitting(false);
    if (rpcError || !result) {
      setError(rpcError ?? (isEdit ? "No fue posible guardar los cambios." : "No fue posible crear el torneo."));
      return;
    }
    onSuccess(result);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{isEdit ? "Editar torneo" : "Crear torneo"}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
                <X width={16} height={16} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
              <View>
                <Text style={styles.fieldLabel}>Nombre del torneo</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Torneo de verano"
                  placeholderTextColor="rgba(148,163,184,0.5)"
                  style={styles.textInput}
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>
                  Descripción <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Descripción o reglas opcionales..."
                  placeholderTextColor="rgba(148,163,184,0.5)"
                  multiline
                  numberOfLines={3}
                  style={[styles.textInput, styles.textArea]}
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Categoría principal</Text>
                {structuralFieldsLocked ? (
                  <View style={styles.lockedBox}>
                    <Text style={styles.lockedText}>{categoryCode || "—"}</Text>
                  </View>
                ) : (
                  <View style={styles.pillRow}>
                    {categories.map((c) => (
                      <TouchableOpacity
                        key={c.code}
                        onPress={() => handleCategoryChange(c.code)}
                        style={[styles.pill, categoryCode === c.code && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, categoryCode === c.code && styles.pillTextActive]}>{c.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View>
                <Text style={styles.fieldLabel}>
                  Categoría secundaria <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                </Text>
                {structuralFieldsLocked ? (
                  <View style={styles.lockedBox}>
                    <Text style={styles.lockedText}>{secondaryCategoryCode || "Ninguna"}</Text>
                  </View>
                ) : (
                  <View style={styles.pillRow}>
                    <TouchableOpacity
                      onPress={() => setSecondaryCategoryCode("")}
                      disabled={!categoryCode}
                      style={[styles.pill, secondaryCategoryCode === "" && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, secondaryCategoryCode === "" && styles.pillTextActive]}>Ninguna</Text>
                    </TouchableOpacity>
                    {secondaryOptions.map((c) => (
                      <TouchableOpacity
                        key={c.code}
                        onPress={() => setSecondaryCategoryCode(c.code)}
                        style={[styles.pill, secondaryCategoryCode === c.code && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, secondaryCategoryCode === c.code && styles.pillTextActive]}>{c.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Text style={styles.helperText}>
                  Selecciona una segunda categoría para un torneo combinado. La principal debe ser superior a la secundaria.
                </Text>
                {structuralFieldsLocked && (
                  <Text style={styles.helperText}>Categoría y apertura de inscripciones ya no son editables.</Text>
                )}
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Cupo máximo de duplas</Text>
                  <TextInput value={maxPairsInput} onChangeText={handleMaxPairsChange} keyboardType="number-pad" style={styles.textInput} />
                  {isEdit && <Text style={styles.helperText}>Mínimo permitido: {effectiveMinMaxPairs} duplas registradas actualmente.</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Inscripción por persona (COP)</Text>
                  <TextInput
                    value={entryFeeAmountInput}
                    onChangeText={setEntryFeeAmountInput}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="rgba(148,163,184,0.5)"
                    style={styles.textInput}
                  />
                </View>
              </View>

              {isEdit && (
                <View>
                  <Text style={styles.fieldLabel}>
                    Portada <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                  </Text>
                  <View style={styles.coverRow}>
                    {tournament!.cover_image_url ? (
                      <Image source={{ uri: tournament!.cover_image_url }} style={styles.coverThumb} />
                    ) : (
                      <View style={[styles.coverThumb, styles.coverThumbPlaceholder]}>
                        <ImageIcon width={18} height={18} color={theme.colors.muted} />
                      </View>
                    )}
                    <TouchableOpacity style={styles.coverEditButton} onPress={onEditCover} disabled={!onEditCover}>
                      <Pencil width={13} height={13} color={theme.colors.white} />
                      <Text style={styles.coverEditButtonText}>Editar portada</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View>
                <Text style={styles.fieldLabel}>Visibilidad</Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity onPress={() => setVisibility("private")} style={[styles.pill, visibility === "private" && styles.pillActive]}>
                    <Text style={[styles.pillText, visibility === "private" && styles.pillTextActive]}>Privado</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setVisibility("public")} style={[styles.pill, visibility === "public" && styles.pillActive]}>
                    <Text style={[styles.pillText, visibility === "public" && styles.pillTextActive]}>Público</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>
                  Premios <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                </Text>
                <TextInput
                  value={prizeInput}
                  onChangeText={setPrizeInput}
                  multiline
                  numberOfLines={3}
                  style={[styles.textInput, styles.textArea]}
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Apertura de inscripciones</Text>
                {structuralFieldsLocked ? (
                  <View style={styles.lockedBox}>
                    <Text style={styles.lockedText}>{registrationOpensAtInput || "—"}</Text>
                  </View>
                ) : (
                  <TextInput
                    value={registrationOpensAtInput}
                    onChangeText={setRegistrationOpensAtInput}
                    placeholder="YYYY-MM-DD HH:mm"
                    placeholderTextColor="rgba(148,163,184,0.5)"
                    style={styles.textInput}
                  />
                )}
              </View>
              <View>
                <Text style={styles.fieldLabel}>
                  Inicio del torneo <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                </Text>
                <TextInput
                  value={startsAtInput}
                  onChangeText={handleStartsAtChange}
                  placeholder="YYYY-MM-DD HH:mm"
                  placeholderTextColor="rgba(148,163,184,0.5)"
                  style={styles.textInput}
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>
                  Cierre de inscripciones <Text style={styles.fieldLabelOptional}>(opcional)</Text>
                </Text>
                <TextInput
                  value={registrationClosesAtInput}
                  onChangeText={handleClosesAtChange}
                  placeholder="YYYY-MM-DD HH:mm"
                  placeholderTextColor="rgba(148,163,184,0.5)"
                  style={styles.textInput}
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>Duración estimada (horas)</Text>
                <TextInput
                  value={durationHoursInput}
                  onChangeText={handleDurationHoursChange}
                  keyboardType="decimal-pad"
                  style={styles.textInput}
                />
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                disabled={submitting}
                onPress={handleSubmit}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.bg} />
                ) : (
                  <Text style={styles.submitButtonText}>{isEdit ? "Guardar cambios" : "Crear torneo"}</Text>
                )}
              </TouchableOpacity>
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
    maxHeight: "92%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  closeButton: { padding: 6, borderRadius: 8 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  fieldLabelOptional: { fontWeight: "400", textTransform: "none" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  pillActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  pillText: { fontSize: 13, color: theme.colors.muted },
  pillTextActive: { color: theme.colors.primary, fontWeight: "600" },
  lockedBox: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  lockedText: { fontSize: 14, color: "rgba(255,255,255,0.5)" },
  coverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  coverThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)" },
  coverThumbPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.15)" },
  coverEditButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  coverEditButtonText: { fontSize: 13, fontWeight: "600", color: theme.colors.white },
  helperText: { fontSize: 12, color: "rgba(148,163,184,0.6)", marginTop: 6 },
  row2: { flexDirection: "row", gap: 12 },
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
  textArea: { height: 72, paddingTop: 10, textAlignVertical: "top" },
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
});
