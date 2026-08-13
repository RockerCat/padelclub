import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";
import { tournamentCategoryLabel } from "../../lib/tournaments";
import { registerTournamentEntry } from "../../lib/tournamentEntryActions";
import { getTournamentCandidates, companionCandidates, type TournamentCandidate } from "../../lib/tournamentCandidates";
import { PlayerTransferList } from "./PlayerTransferList";
import type { TournamentEntryMemberDisplay } from "../../lib/tournamentEntries";
import type { TournamentEntryRow } from "../../types/domain";

// Traducción 1:1 de RegisterEntryModal.tsx (app web) — mismo flujo en
// ambos modos: cargar candidatos elegibles (get_club_category_ranking_view,
// vía tournamentCandidates.ts), misma regla de composición para torneo
// combinado (companionCandidates), mismo RPC register_tournament_entry (la
// propia RPC decide confirmed-directo para OWNER/ADMIN vs. pending para
// PLAYER, nunca el cliente). mode="player" fija memberOneId en
// ownClubMemberId desde el inicio y esa fila queda bloqueada
// (lockedPlayerIds en PlayerTransferList) — el jugador solo elige a su
// partner, nunca puede quitarse a sí mismo del formulario.
export function RegisterEntryModal({
  clubId,
  tournamentId,
  category,
  secondaryCategory,
  excludeClubMemberIds,
  mode,
  onClose,
  onSuccess,
}: {
  clubId: string;
  tournamentId: string;
  category: string;
  secondaryCategory: string | null;
  excludeClubMemberIds: string[];
  mode:
    | { type: "admin" }
    | { type: "player"; ownClubMemberId: string; ownFullName: string | null; ownAvatarUrl: string | null; ownCategory: string | null };
  onClose: () => void;
  onSuccess: (entry: TournamentEntryRow, members: TournamentEntryMemberDisplay[]) => void;
}) {
  const [candidates, setCandidates] = useState<TournamentCandidate[] | null>(null);
  const [memberOneId, setMemberOneId] = useState<string | null>(mode.type === "player" ? mode.ownClubMemberId : null);
  const [memberTwoId, setMemberTwoId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const categories = [category, secondaryCategory].filter((c): c is string => !!c);
    getTournamentCandidates(supabase, clubId, categories, excludeClubMemberIds).then(({ candidates: result, error: loadError }) => {
      if (loadError) {
        setError(loadError);
        setCandidates([]);
        return;
      }
      setCandidates(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIds = [memberOneId, memberTwoId].filter((id): id is string => !!id);

  function handleSelect(id: string) {
    if (!memberOneId) setMemberOneId(id);
    else if (!memberTwoId) setMemberTwoId(id);
  }
  function handleDeselect(id: string) {
    // El propio jugador nunca se quita a sí mismo — defensa adicional, ya
    // que su fila ni siquiera expone un botón "×" para esto (mismo criterio
    // que RegisterEntryModal.tsx, app web).
    if (mode.type === "player" && id === mode.ownClubMemberId) return;
    if (memberOneId === id) {
      setMemberOneId(memberTwoId);
      setMemberTwoId(null);
    } else if (memberTwoId === id) {
      setMemberTwoId(null);
    }
  }

  const firstCategory = memberOneId ? candidates?.find((c) => c.club_member_id === memberOneId)?.category ?? null : null;
  const filterAvailable = secondaryCategory
    ? (c: TournamentCandidate) => companionCandidates([c], firstCategory, category, secondaryCategory).length > 0
    : undefined;

  async function handleSubmit() {
    if (!memberOneId || !memberTwoId) {
      setError(mode.type === "player" ? "Selecciona a tu partner." : "Selecciona a los dos jugadores.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { entry, error: rpcError } = await registerTournamentEntry(supabase, tournamentId, memberOneId, memberTwoId);
    setSubmitting(false);
    if (rpcError || !entry) {
      setError(rpcError ?? "No fue posible registrar la dupla.");
      return;
    }
    const selectedMembers: TournamentEntryMemberDisplay[] = [memberOneId, memberTwoId]
      .map((id) => candidates?.find((c) => c.club_member_id === id))
      .filter((c): c is TournamentCandidate => !!c)
      .map((c) => ({ club_member_id: c.club_member_id, profile_id: null, full_name: c.full_name, avatar_url: c.avatar_url, category: c.category }));
    onSuccess(entry, selectedMembers);
  }

  const helpText = secondaryCategory
    ? `Puedes registrar una dupla formada por una persona de ${category} y una de ${secondaryCategory}, o por dos personas de ${secondaryCategory}. No se permiten dos jugadores de ${category}.`
    : `Ambos jugadores deben pertenecer a la categoría ${category}.`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { height: Math.round(windowHeight * 0.92) }]}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Registrar dupla</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
                <X width={16} height={16} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.body, { paddingBottom: insets.bottom }]}>
              <PlayerTransferList
                candidates={candidates ?? []}
                loading={candidates === null}
                noCandidatesText={`No hay jugadores disponibles en la categoría ${tournamentCategoryLabel(category, secondaryCategory)} para inscribirse.`}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onDeselect={handleDeselect}
                filterAvailable={filterAvailable}
                lockedPlayerIds={mode.type === "player" ? [mode.ownClubMemberId] : []}
                panelTitle={mode.type === "player" ? "Tu dupla" : "Dupla seleccionada"}
                partnerHintText={mode.type === "player" ? "Selecciona tu partner." : undefined}
                headerExtra={<Text style={styles.helpText}>{helpText}</Text>}
                footerExtra={
                  <>
                    {error && (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.submitButton, (submitting || selectedIds.length < 2) && styles.submitButtonDisabled]}
                      disabled={submitting || selectedIds.length < 2}
                      onPress={handleSubmit}
                      activeOpacity={0.85}
                    >
                      {submitting ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.submitButtonText}>Registrar dupla</Text>}
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
  // Altura FIJA en píxeles (calculada en render desde useWindowDimensions,
  // nunca `maxHeight: "92%"`) — un `maxHeight` porcentual aquí resuelve
  // contra `sheetWrap` (el KeyboardAvoidingView), cuya propia altura es
  // "auto" (solo declara width:100%, sin flex ni height). Esa cadena
  // porcentual-sobre-padre-auto es ambigua para Yoga y, combinada con
  // `body: {flex:1}` más abajo (que también necesita un ancestro de
  // altura DEFINIDA para repartir espacio), colapsaba el alto real del
  // sheet a poco más que el header — el resto del contenido seguía
  // pintándose con su tamaño natural y quedaba fuera del viewport, ya que
  // `sheet` tampoco tenía `overflow: hidden`. Con una altura fija real
  // (no un `maxHeight` derivado de un padre ambiguo), `body: {flex:1}`
  // pasa a tener un contenedor con tamaño resuelto sin ambigüedad, y el
  // FlatList de PlayerTransferList (style `{flex:1}`) ocupa exactamente
  // el espacio restante bajo el header — misma única raíz de scroll de
  // siempre, ahora con un alto de sheet que Yoga puede calcular en un
  // solo paso.
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  closeButton: { padding: 6, borderRadius: 8 },
  // flex:1 para que el único FlatList de PlayerTransferList reciba la
  // altura real restante de `sheet` (ahora fija) bajo el header y pueda
  // scrollear internamente — mismo bottom-sheet de siempre, un solo
  // contenedor de scroll. paddingBottom dinámico (insets.bottom, agregado
  // inline en el JSX) respeta el safe area inferior (home indicator) sin
  // depender de PlayerTransferList/FlatList, que no cambian.
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  helpText: { fontSize: 12, color: theme.colors.muted, lineHeight: 18 },
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
