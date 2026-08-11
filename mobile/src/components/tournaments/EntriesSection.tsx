import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Plus, Users } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";
import { confirmTournamentEntry, rejectTournamentEntry, withdrawTournamentEntry } from "../../lib/tournamentEntryActions";
import { RegisterEntryModal } from "./RegisterEntryModal";
import { EntryCard } from "./EntryCard";
import type { TournamentEntryWithMembers, TournamentEntriesCapacity } from "../../lib/tournamentEntries";
import type { Tournament, TournamentEntryRow } from "../../types/domain";

// Traducción 1:1 de EntriesSection.tsx (app web, rama OWNER/ADMIN) —
// misma barra de capacidad, mismos banners por status, mismos 3 grupos
// (Pendientes/Confirmadas[oculto si hideConfirmedList]/Rechazadas — las
// retiradas viven aparte en WithdrawnEntriesAccordion, nunca acá), mismos
// botones por entry (Confirmar/Rechazar/Retirar) con las mismas
// condiciones de status exactas.
export function EntriesSection({
  clubId,
  tournament,
  entries,
  capacity,
  hideConfirmedList,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
  onEntryPatched,
  onEntryRegistered,
  onToast,
}: {
  clubId: string;
  tournament: Tournament;
  entries: TournamentEntryWithMembers[];
  capacity: TournamentEntriesCapacity;
  hideConfirmedList: boolean;
  avatarsClickable?: boolean;
  onSelectMember?: (clubMemberId: string) => void;
  loadingMemberId?: string | null;
  onEntryPatched: (row: TournamentEntryRow) => void;
  onEntryRegistered: (row: TournamentEntryRow, members: TournamentEntryWithMembers["members"]) => void;
  onToast: (msg: string) => void;
}) {
  const [registering, setRegistering] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  const status = tournament.status;
  const full = capacity.occupied >= capacity.total;
  const canAdminRegister = ["registration_open", "registration_closed", "in_progress"].includes(status) && !full;
  const canConfirmOrRejectStatus = ["registration_open", "registration_closed"].includes(status);
  const canWithdrawStatus = ["registration_open", "registration_closed"].includes(status);

  const pending = entries.filter((e) => e.status === "pending");
  const confirmed = entries.filter((e) => e.status === "confirmed");
  const rejected = entries.filter((e) => e.status === "rejected");
  const registeredMemberIds = [...pending, ...confirmed].flatMap((e) => e.members.map((m) => m.club_member_id));

  async function handleConfirm(entryId: string) {
    setBusyEntryId(entryId);
    const { entry, error } = await confirmTournamentEntry(supabase, entryId);
    setBusyEntryId(null);
    if (error || !entry) {
      Alert.alert("No fue posible confirmar", error ?? "Inténtalo de nuevo.");
      return;
    }
    onEntryPatched(entry);
    onToast("Dupla confirmada correctamente");
  }

  async function handleWithdraw(entryId: string) {
    setBusyEntryId(entryId);
    const { entry, error } = await withdrawTournamentEntry(supabase, entryId);
    setBusyEntryId(null);
    if (error || !entry) {
      Alert.alert("No fue posible retirar", error ?? "Inténtalo de nuevo.");
      return;
    }
    onEntryPatched(entry);
    onToast("Inscripción retirada correctamente");
  }

  async function handleReject() {
    if (!rejectingId) return;
    setRejectSubmitting(true);
    setRejectError(null);
    const { entry, error } = await rejectTournamentEntry(supabase, rejectingId, rejectReason);
    setRejectSubmitting(false);
    if (error || !entry) {
      setRejectError(error ?? "No fue posible rechazar la solicitud.");
      return;
    }
    onEntryPatched(entry);
    onToast("Solicitud rechazada correctamente");
    setRejectingId(null);
    setRejectReason("");
  }

  function confirmDialog(entryId: string) {
    Alert.alert("¿Confirmar esta dupla?", "La dupla quedará oficialmente inscrita en el torneo.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", onPress: () => handleConfirm(entryId) },
    ]);
  }

  function withdrawDialog(entryId: string) {
    Alert.alert("¿Retirar esta inscripción?", "La dupla dejará de ocupar un cupo en el torneo.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Retirar inscripción", style: "destructive", onPress: () => handleWithdraw(entryId) },
    ]);
  }

  function entryActions(entry: TournamentEntryWithMembers) {
    const showConfirm = entry.status === "pending" && canConfirmOrRejectStatus;
    const showReject = entry.status === "pending" && canConfirmOrRejectStatus;
    const showWithdraw = entry.status === "confirmed" && canWithdrawStatus;
    if (!showConfirm && !showReject && !showWithdraw) return null;
    const busy = busyEntryId === entry.id;
    return (
      <>
        {showConfirm && (
          <TouchableOpacity style={styles.actionBtnSecondary} disabled={busy} onPress={() => confirmDialog(entry.id)}>
            {busy ? <ActivityIndicator size="small" color={theme.colors.white} /> : <Text style={styles.actionBtnSecondaryText}>Confirmar</Text>}
          </TouchableOpacity>
        )}
        {showReject && (
          <TouchableOpacity style={styles.actionBtnDanger} disabled={busy} onPress={() => setRejectingId(entry.id)}>
            <Text style={styles.actionBtnDangerText}>Rechazar</Text>
          </TouchableOpacity>
        )}
        {showWithdraw && (
          <TouchableOpacity style={styles.actionBtnDanger} disabled={busy} onPress={() => withdrawDialog(entry.id)}>
            {busy ? <ActivityIndicator size="small" color={theme.colors.danger} /> : <Text style={styles.actionBtnDangerText}>Retirar</Text>}
          </TouchableOpacity>
        )}
      </>
    );
  }

  const barColor = full ? theme.colors.success : capacity.occupied >= capacity.total - 1 ? theme.colors.warning : theme.colors.primary;
  const barWidth = `${Math.min(100, Math.round((capacity.occupied / Math.max(1, capacity.total)) * 100))}%` as const;

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>Inscripciones</Text>
        {canAdminRegister && (
          <TouchableOpacity style={styles.registerButton} onPress={() => setRegistering(true)}>
            <Plus width={16} height={16} color={theme.colors.bg} />
            <Text style={styles.registerButtonText}>Registrar dupla</Text>
          </TouchableOpacity>
        )}
      </View>

      <View>
        <View style={styles.capacityRow}>
          <Text style={styles.capacityText}>
            {capacity.occupied} de {capacity.total} duplas inscritas
          </Text>
          {full && <Text style={styles.capacityFull}>Cupo completo</Text>}
        </View>
        <View style={styles.capacityBarTrack}>
          <View style={[styles.capacityBarFill, { width: barWidth, backgroundColor: barColor }]} />
        </View>
      </View>

      {status === "draft" && <Text style={styles.banner}>Abre las inscripciones para comenzar a registrar duplas.</Text>}
      {full && status === "registration_open" && (
        <Text style={[styles.banner, { color: theme.colors.warning }]}>El torneo alcanzó su cupo máximo de duplas.</Text>
      )}

      {pending.length + confirmed.length + rejected.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Users width={20} height={20} color={theme.colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>Aún no hay duplas inscritas</Text>
          <Text style={styles.emptySubtitle}>
            {status === "registration_open"
              ? "Todavía no hay duplas inscritas. Registra la primera dupla del torneo."
              : "Cuando abras las inscripciones podrás registrar duplas para el torneo."}
          </Text>
        </View>
      ) : (
        <>
          <EntryGroup title="Pendientes" entries={pending} highlight={pending.length > 0}>
            {(entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                actions={entryActions(entry)}
                avatarsClickable={avatarsClickable}
                onSelectMember={onSelectMember}
                loadingMemberId={loadingMemberId}
              />
            )}
          </EntryGroup>

          {!hideConfirmedList && (
            <EntryGroup title="Confirmadas" entries={confirmed}>
              {(entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  actions={entryActions(entry)}
                  avatarsClickable={avatarsClickable}
                  onSelectMember={onSelectMember}
                  loadingMemberId={loadingMemberId}
                />
              )}
            </EntryGroup>
          )}

          <EntryGroup title="Rechazadas" entries={rejected}>
            {(entry) => (
              <EntryCard key={entry.id} entry={entry} avatarsClickable={avatarsClickable} onSelectMember={onSelectMember} loadingMemberId={loadingMemberId} />
            )}
          </EntryGroup>
        </>
      )}

      {registering && (
        <RegisterEntryModal
          clubId={clubId}
          tournamentId={tournament.id}
          category={tournament.category}
          secondaryCategory={tournament.secondary_category}
          excludeClubMemberIds={registeredMemberIds}
          onClose={() => setRegistering(false)}
          onSuccess={(entry, members) => {
            setRegistering(false);
            onEntryRegistered(entry, members);
            onToast("Dupla registrada correctamente");
          }}
        />
      )}

      <Modal visible={!!rejectingId} transparent animationType="slide" onRequestClose={() => setRejectingId(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setRejectingId(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={styles.rejectSheet}>
              <Text style={styles.rejectTitle}>Rechazar solicitud</Text>
              <Text style={styles.fieldLabel}>Motivo del rechazo</Text>
              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Explica brevemente por qué se rechaza esta solicitud..."
                placeholderTextColor="rgba(148,163,184,0.5)"
                multiline
                numberOfLines={3}
                style={styles.rejectInput}
              />
              {rejectError && <Text style={styles.rejectError}>{rejectError}</Text>}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.rejectSubmitButton, rejectSubmitting && { opacity: 0.6 }]}
                  disabled={rejectSubmitting}
                  onPress={handleReject}
                >
                  {rejectSubmitting ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.rejectSubmitText}>Rechazar solicitud</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setRejectingId(null)}>
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function EntryGroup({
  title,
  entries,
  highlight,
  children,
}: {
  title: string;
  entries: TournamentEntryWithMembers[];
  highlight?: boolean;
  children: (entry: TournamentEntryWithMembers) => React.ReactNode;
}) {
  if (entries.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.groupHeader}>
        {highlight && <View style={styles.groupDot} />}
        <Text style={[styles.groupTitle, highlight && styles.groupTitleHighlight]}>
          {title} ({entries.length})
        </Text>
      </View>
      {entries.map(children)}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h2: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  registerButton: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.colors.primary },
  registerButtonText: { fontSize: 12, fontWeight: "700", color: theme.colors.bg },
  capacityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  capacityText: { fontSize: 12, color: theme.colors.muted },
  capacityFull: { fontSize: 12, color: theme.colors.success, fontWeight: "600" },
  capacityBarTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  capacityBarFill: { height: 6, borderRadius: 3 },
  banner: { fontSize: 12, color: theme.colors.muted, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 10 },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 4 },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  emptySubtitle: { fontSize: 12, color: theme.colors.muted, textAlign: "center", maxWidth: 280 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  groupDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.warning },
  // Sin uppercase/letter-spacing — WEB muestra "Pendientes (2)" en
  // capitalización normal (text-xs font-medium, o font-semibold + ámbar
  // cuando highlight), nunca en mayúsculas.
  groupTitle: { fontSize: 12, fontWeight: "500", color: theme.colors.muted },
  groupTitleHighlight: { fontWeight: "600", color: theme.colors.warning },
  actionBtnSecondary: { height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  actionBtnSecondaryText: { fontSize: 12, fontWeight: "600", color: theme.colors.white },
  actionBtnDanger: { height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "rgba(248,113,113,0.3)", alignItems: "center", justifyContent: "center" },
  actionBtnDangerText: { fontSize: 12, fontWeight: "600", color: theme.colors.danger },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  rejectSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    gap: 12,
  },
  rejectTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  rejectInput: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingTop: 10,
    color: theme.colors.white,
    fontSize: 14,
    textAlignVertical: "top",
  },
  rejectError: { fontSize: 13, color: theme.colors.danger },
  cancelButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  cancelButtonText: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  rejectSubmitButton: { flex: 1, height: 44, borderRadius: 12, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center" },
  rejectSubmitText: { fontSize: 14, fontWeight: "700", color: "#1a0000" },
});
