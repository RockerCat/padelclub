import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { theme } from "../../lib/theme";
import { PlayerAvatar } from "../PlayerAvatar";
import type { TournamentCandidate } from "../../lib/tournamentCandidates";

// Equivalente RN de PlayerCombobox.tsx (app web) — selector único
// buscable: seleccionado muestra una fila rellena con X para limpiar; sin
// selección muestra buscador + lista. Único FlatList del modal que lo usa
// (ReplaceMemberModal.tsx) — headerExtra/footerExtra dejan que el resto
// del formulario ("¿quién sale?", error, botón "Reemplazar") viva dentro
// de ListHeaderComponent/ListFooterComponent, mismo patrón ya establecido
// en PlayerTransferList.tsx para que el modal tenga una única raíz de
// scroll vertical (antes este FlatList vivía anidado dentro del
// ScrollView del modal, disparando el warning de RN "VirtualizedLists
// should never be nested inside plain ScrollViews with the same
// orientation").
export function PlayerCombobox({
  candidates,
  value,
  onChange,
  disabled,
  loading,
  placeholder = "Buscar jugador...",
  headerExtra,
  footerExtra,
}: {
  candidates: TournamentCandidate[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  headerExtra?: ReactNode;
  footerExtra?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const selected = candidates.find((c) => c.club_member_id === value) ?? null;

  const trimmed = search.trim().toLowerCase();
  const filtered = useMemo(
    () => candidates.filter((c) => !trimmed || (c.full_name ?? "").toLowerCase().includes(trimmed)),
    [candidates, trimmed]
  );

  const listHeader = (
    <View style={{ gap: 12 }}>
      {headerExtra}
      {selected ? (
        <View style={[styles.selectedRow, disabled && styles.dimmed]}>
          <PlayerAvatar player={{ id: selected.club_member_id, full_name: selected.full_name, avatar_url: selected.avatar_url }} size="sm" />
          <Text style={styles.selectedName} numberOfLines={1}>
            {selected.full_name ?? "Jugador"}
          </Text>
          <View style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{selected.category}</Text>
          </View>
          {!disabled && (
            <TouchableOpacity onPress={() => onChange(null)} hitSlop={8}>
              <X width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      ) : !loading ? (
        <View style={[styles.searchBox, disabled && styles.dimmed]}>
          <Search width={16} height={16} color={theme.colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            editable={!disabled}
            placeholder={placeholder}
            placeholderTextColor="rgba(148,163,184,0.6)"
            style={styles.searchInput}
          />
        </View>
      ) : null}
    </View>
  );

  const listEmpty = loading ? (
    <View style={styles.centerBox}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  ) : selected ? null : (
    <Text style={[styles.emptyText, styles.centerText]}>No hay jugadores disponibles.</Text>
  );

  return (
    <FlatList
      data={loading || selected ? [] : filtered}
      keyExtractor={(c) => c.club_member_id}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={footerExtra ? <View style={{ gap: 16, marginTop: 16 }}>{footerExtra}</View> : null}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.candidateRow, disabled && styles.dimmed]}
          disabled={disabled}
          onPress={() => onChange(item.club_member_id)}
          activeOpacity={0.7}
        >
          <PlayerAvatar player={{ id: item.club_member_id, full_name: item.full_name, avatar_url: item.avatar_url }} size="sm" />
          <Text style={styles.candidateName} numberOfLines={1}>
            {item.full_name ?? "Jugador"}
          </Text>
          <View style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{item.category}</Text>
          </View>
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.5 },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedName: { flex: 1, fontSize: 13, color: theme.colors.white, fontWeight: "500" },
  categoryChip: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  categoryChipText: { fontSize: 10, color: theme.colors.muted, fontWeight: "600" },
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
  emptyText: { fontSize: 13, color: theme.colors.muted },
  centerBox: { paddingVertical: 24, alignItems: "center" },
  centerText: { textAlign: "center", paddingVertical: 24 },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
});
