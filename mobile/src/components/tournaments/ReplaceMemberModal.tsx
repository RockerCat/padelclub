import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";
import { replaceTournamentEntryMember } from "../../lib/tournamentEntryActions";
import { getTournamentCandidates, type TournamentCandidate } from "../../lib/tournamentCandidates";
import { PlayerAvatar } from "../PlayerAvatar";
import { PlayerCombobox } from "./PlayerCombobox";
import type { TournamentEntryMemberDisplay } from "../../lib/tournamentEntries";

// Traducción 1:1 de ReplaceMemberModal.tsx (app web) — paso 1 "¿Quién sale
// de la dupla?" (lista radio de los integrantes actuales, preseleccionado
// si solo hay 1 visible por RLS), paso 2 "¿Quién entra?" (PlayerCombobox,
// candidatos = unión de ambas categorías del torneo, sin el filtro de
// composición de RegisterEntryModal — el RPC replace_tournament_entry_member
// es el validador real). Solo alcanzable en una dupla confirmed mientras
// el torneo está in_progress (gating decidido por el caller). El único
// FlatList del modal (dentro de PlayerCombobox) es su única raíz de
// scroll vertical — el paso 1 y el botón "Reemplazar" viven en su
// headerExtra/footerExtra, mismo patrón que RegisterEntryModal.tsx, para
// no anidar un FlatList vertical dentro de un ScrollView vertical.
export function ReplaceMemberModal({
  clubId,
  entryId,
  members,
  category,
  secondaryCategory,
  excludeClubMemberIds,
  onClose,
  onSuccess,
}: {
  clubId: string;
  entryId: string;
  members: TournamentEntryMemberDisplay[];
  category: string;
  secondaryCategory: string | null;
  excludeClubMemberIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [candidates, setCandidates] = useState<TournamentCandidate[] | null>(null);
  const [outgoingId, setOutgoingId] = useState<string | null>(members.length === 1 ? members[0].club_member_id : null);
  const [incomingId, setIncomingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const categories = [category, secondaryCategory].filter((c): c is string => !!c);
    const memberIds = members.map((m) => m.club_member_id);
    getTournamentCandidates(supabase, clubId, categories, [...excludeClubMemberIds, ...memberIds]).then(
      ({ candidates: result, error: loadError }) => {
        if (loadError) {
          setError(loadError);
          setCandidates([]);
          return;
        }
        setCandidates(result);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!outgoingId) {
      setError("Selecciona qué jugador sale de la dupla.");
      return;
    }
    if (!incomingId) {
      setError("Selecciona al jugador que entra.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { success, error: rpcError } = await replaceTournamentEntryMember(supabase, entryId, outgoingId, incomingId);
    setSubmitting(false);
    if (!success) {
      setError(rpcError ?? "No fue posible reemplazar al integrante.");
      return;
    }
    onSuccess();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Cambiar jugadores</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
                <X width={16} height={16} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.body}>
              <PlayerCombobox
                candidates={candidates ?? []}
                loading={candidates === null}
                value={incomingId}
                onChange={setIncomingId}
                disabled={!outgoingId}
                headerExtra={
                  <>
                    <View>
                      <Text style={styles.fieldLabel}>¿Quién sale de la dupla?</Text>
                      <View style={{ gap: 8 }}>
                        {members.map((m) => (
                          <TouchableOpacity
                            key={m.club_member_id}
                            style={[styles.memberRow, outgoingId === m.club_member_id && styles.memberRowActive]}
                            onPress={() => setOutgoingId(m.club_member_id)}
                          >
                            <PlayerAvatar player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }} size="sm" />
                            <Text style={styles.memberName} numberOfLines={1}>
                              {m.full_name ?? "Jugador"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <Text style={styles.fieldLabel}>¿Quién entra?</Text>
                  </>
                }
                footerExtra={
                  <>
                    {error && (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.submitButton, (submitting || !outgoingId || !incomingId) && styles.submitButtonDisabled]}
                      disabled={submitting || !outgoingId || !incomingId}
                      onPress={handleSubmit}
                      activeOpacity={0.85}
                    >
                      {submitting ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.submitButtonText}>Reemplazar</Text>}
                    </TouchableOpacity>
                  </>
                }
              />
            </View>
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
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  memberRowActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  memberName: { flex: 1, fontSize: 13, color: theme.colors.white, fontWeight: "500" },
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
