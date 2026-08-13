import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { theme } from "../../lib/theme";
import { PlayerAvatar } from "../PlayerAvatar";
import type { TournamentCandidate } from "../../lib/tournamentCandidates";

// Equivalente RN de PlayerTransferList.tsx (app web) — misma idea (elegir
// hasta 2 jugadores para formar una dupla), adaptada a un único panel con
// buscador + lista (en vez de dos paneles lado a lado, que no caben en
// una pantalla de teléfono): fila de "Dupla seleccionada" arriba (0-2
// slots, con botón de quitar), buscador + lista de candidatos disponibles
// abajo (tocar agrega en orden — primero llena el slot 1, luego el 2).
//
// Todo el contenido (incluido lo que antes vivía en el ScrollView del
// modal que envuelve a este componente) se renderiza dentro de un único
// FlatList — panel de seleccionados/buscador van en ListHeaderComponent
// (junto con `headerExtra`, p.ej. el texto de ayuda del modal) y
// error/botón de envío van en ListFooterComponent (`footerExtra`). Antes
// este FlatList vivía anidado dentro de un ScrollView vertical del
// mismo modal (RegisterEntryModal.tsx), lo que disparaba el warning de
// RN "VirtualizedLists should never be nested inside plain ScrollViews
// with the same orientation" — con un solo FlatList como raíz de scroll
// del modal, ese anidamiento deja de existir.
export function PlayerTransferList({
  candidates,
  loading,
  noCandidatesText = "No hay jugadores disponibles.",
  selectedIds,
  onSelect,
  onDeselect,
  panelTitle = "Dupla seleccionada",
  partnerHintText,
  emptyText = "Selecciona 2 jugadores para formar la dupla.",
  filterAvailable,
  lockedPlayerIds = [],
  headerExtra,
  footerExtra,
}: {
  candidates: TournamentCandidate[];
  loading?: boolean;
  noCandidatesText?: string;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onDeselect: (id: string) => void;
  panelTitle?: string;
  partnerHintText?: string;
  emptyText?: string;
  // Traducción 1:1 del prop `lockedPlayerIds` de PlayerTransferList.tsx
  // (app web) — el propio jugador en modo autoinscripción (ver
  // RegisterEntryModal.tsx, mode.type === "player") nunca puede quitarse
  // a sí mismo: su fila seleccionada oculta el botón "×", nunca deja de
  // mostrarse.
  lockedPlayerIds?: string[];
  // Filtro de composición (companionCandidates en la web) — se aplica
  // SOLO a la lista de disponibles, nunca a la resolución de los ya
  // seleccionados (evita que el primer seleccionado desaparezca de su
  // propia fila si su categoría no matchea el filtro del segundo slot).
  filterAvailable?: (c: TournamentCandidate) => boolean;
  headerExtra?: ReactNode;
  footerExtra?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const isFull = selectedIds.length >= 2;
  const showPicker = !loading && candidates.length > 0;

  const selected = selectedIds.map((id) => candidates.find((c) => c.club_member_id === id)).filter((c): c is TournamentCandidate => !!c);

  const trimmed = search.trim().toLowerCase();
  const available = useMemo(
    () =>
      showPicker
        ? candidates.filter(
            (c) =>
              !selectedIds.includes(c.club_member_id) &&
              (!filterAvailable || filterAvailable(c)) &&
              (!trimmed || (c.full_name ?? "").toLowerCase().includes(trimmed))
          )
        : [],
    [showPicker, candidates, selectedIds, trimmed, filterAvailable]
  );

  const listHeader = (
    <View style={{ gap: 12 }}>
      {headerExtra}
      {showPicker && (
        <>
          <View>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{panelTitle}</Text>
              {isFull && (
                <View style={styles.completePill}>
                  <Text style={styles.completePillText}>Completa</Text>
                </View>
              )}
            </View>
            <View style={styles.selectedBox}>
              {selected.length === 0 && !partnerHintText && <Text style={styles.emptyText}>{emptyText}</Text>}
              {selected.map((c) => (
                <View key={c.club_member_id} style={styles.selectedRow}>
                  <PlayerAvatar player={{ id: c.club_member_id, full_name: c.full_name, avatar_url: c.avatar_url }} size="sm" />
                  <Text style={styles.selectedName} numberOfLines={1}>
                    {c.full_name ?? "Sin nombre"}
                  </Text>
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryChipText}>{c.category}</Text>
                  </View>
                  {!lockedPlayerIds.includes(c.club_member_id) && (
                    <TouchableOpacity onPress={() => onDeselect(c.club_member_id)} hitSlop={8}>
                      <X width={16} height={16} color={theme.colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {selected.length === 1 && partnerHintText && (
                <View style={styles.hintRow}>
                  <Text style={styles.hintText}>{partnerHintText}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.searchBox}>
            <Search width={16} height={16} color={theme.colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar jugador..."
              placeholderTextColor="rgba(148,163,184,0.6)"
              style={styles.searchInput}
            />
          </View>
        </>
      )}
    </View>
  );

  const listEmpty = loading ? (
    <View style={styles.centerBox}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  ) : candidates.length === 0 ? (
    <Text style={[styles.emptyText, styles.centerText]}>{noCandidatesText}</Text>
  ) : (
    <Text style={[styles.emptyText, styles.centerText]}>No hay más jugadores disponibles.</Text>
  );

  return (
    <FlatList
      data={available}
      keyExtractor={(c) => c.club_member_id}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={footerExtra ? <View style={{ gap: 16, marginTop: 16 }}>{footerExtra}</View> : null}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.candidateRow}
          disabled={isFull}
          onPress={() => onSelect(item.club_member_id)}
          activeOpacity={0.7}
        >
          <PlayerAvatar player={{ id: item.club_member_id, full_name: item.full_name, avatar_url: item.avatar_url }} size="sm" />
          <Text style={[styles.candidateName, isFull && { opacity: 0.4 }]} numberOfLines={1}>
            {item.full_name ?? "Sin nombre"}
          </Text>
          <View style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{item.category}</Text>
          </View>
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  panelTitle: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  completePill: { backgroundColor: `${theme.colors.success}26`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  completePillText: { fontSize: 10, fontWeight: "700", color: theme.colors.success },
  selectedBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
    gap: 8,
    minHeight: 56,
  },
  selectedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectedName: { flex: 1, fontSize: 13, color: theme.colors.white, fontWeight: "500" },
  categoryChip: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  categoryChipText: { fontSize: 10, color: theme.colors.muted, fontWeight: "600" },
  hintRow: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    padding: 8,
  },
  hintText: { fontSize: 12, color: theme.colors.muted },
  emptyText: { fontSize: 13, color: theme.colors.muted, paddingVertical: 4 },
  centerBox: { paddingVertical: 24, alignItems: "center" },
  centerText: { textAlign: "center", paddingVertical: 24 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: theme.colors.white, fontSize: 14 },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: 24 },
  candidateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingVertical: 10 },
  candidateName: { flex: 1, fontSize: 13, color: theme.colors.white },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
});
