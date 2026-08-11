import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, ChevronRight, ChevronDown, Check, Users } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useClub } from "../contexts/ClubContext";
import {
  getClubMembers,
  getSportCategories,
  getSportStateByMember,
  PLAYERS_STATUS_OPTIONS,
  PLAYERS_CATEGORY_ALL,
  type MemberRow,
  type SportCategoryRow,
  type MemberSportState,
  type PlayersStatusFilter,
} from "../lib/players";
import { PlayerSportAvatar } from "../components/PlayerSportAvatar";
import { PlayerDetailSheet } from "../components/PlayerDetailSheet";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";

// Equivalente RN de src/app/(app)/[club]/admin/players/page.tsx +
// MembersClient.tsx (app web) — rama mobile (CompactMemberRow): mismo
// header con contador, mismo buscador+filtros, misma fila compacta
// (PlayerSportAvatar + nombre + categoría·#rank·pts + Activo/Inactivo +
// chevron), mismos 3 empty states. La grilla de tarjetas grandes (desktop)
// no se replica — la propia web la oculta en mobile (`hidden md:grid`).
export function PlayersScreen() {
  const { club } = useClub();
  const [statusFilter, setStatusFilter] = useState<PlayersStatusFilter>("active");
  const [categoryFilter, setCategoryFilter] = useState<string>(PLAYERS_CATEGORY_ALL);
  const [search, setSearch] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [categories, setCategories] = useState<SportCategoryRow[]>([]);
  const [sportState, setSportState] = useState<Record<string, MemberSportState>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  const load = useCallback(async () => {
    if (!club) return;
    const [memberRows, categoryRows] = await Promise.all([
      getClubMembers(supabase, club.id, statusFilter),
      getSportCategories(supabase),
    ]);
    setMembers(memberRows);
    setCategories(categoryRows);
    const state = await getSportStateByMember(supabase, club.id, categoryRows, memberRows, statusFilter);
    setSportState(state);
  }, [club, statusFilter]);

  useEffect(() => {
    if (!club) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [club, statusFilter, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const categoryOptions = useMemo(
    () => [{ value: PLAYERS_CATEGORY_ALL, label: "Todas" }, ...categories.map((c) => ({ value: c.code, label: c.code }))],
    [categories]
  );

  const categoryFiltered = useMemo(
    () => (categoryFilter === PLAYERS_CATEGORY_ALL ? members : members.filter((m) => sportState[m.id]?.category === categoryFilter)),
    [members, categoryFilter, sportState]
  );

  const trimmedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (trimmedSearch ? categoryFiltered.filter((m) => m.profiles?.full_name?.toLowerCase().includes(trimmedSearch)) : categoryFiltered),
    [categoryFiltered, trimmedSearch]
  );

  const emptyReason: "category" | "activeStatus" | "search" | "generic" | null =
    filtered.length > 0
      ? null
      : members.length === 0
      ? categoryFilter !== PLAYERS_CATEGORY_ALL
        ? "category"
        : statusFilter === "active"
        ? "activeStatus"
        : "generic"
      : "search";

  const statusLabel = PLAYERS_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter;
  const categoryLabel = categoryOptions.find((o) => o.value === categoryFilter)?.label ?? categoryFilter;

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Skeleton style={{ height: 24, width: "50%" }} />
          <Skeleton style={{ height: 44, borderRadius: 12 }} />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 56, borderRadius: 12 }} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
        data={filtered}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View>
              <Text style={styles.h1}>Jugadores</Text>
              <Text style={styles.subtitle}>
                {members.length} {members.length === 1 ? "jugador" : "jugadores"} en el club.
              </Text>
            </View>

            <View style={styles.searchBox}>
              <Search width={16} height={16} color={theme.colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por nombre..."
                placeholderTextColor="rgba(148,163,184,0.6)"
                style={styles.searchInput}
              />
            </View>

            <View style={styles.filtersRow}>
              <TouchableOpacity
                onPress={() => setStatusMenuOpen(true)}
                style={[styles.filterPill, statusFilter !== "active" && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, statusFilter !== "active" && styles.filterPillTextActive]}>
                  Estado: {statusLabel}
                </Text>
                <ChevronDown width={14} height={14} color={statusFilter !== "active" ? theme.colors.primary : theme.colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCategoryMenuOpen(true)}
                style={[styles.filterPill, categoryFilter !== PLAYERS_CATEGORY_ALL && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, categoryFilter !== PLAYERS_CATEGORY_ALL && styles.filterPillTextActive]}>
                  Categoría: {categoryLabel}
                </Text>
                <ChevronDown
                  width={14}
                  height={14}
                  color={categoryFilter !== PLAYERS_CATEGORY_ALL ? theme.colors.primary : theme.colors.muted}
                />
              </TouchableOpacity>
            </View>

            {filtered.length === 0 && (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <Users width={20} height={20} color={theme.colors.muted} />
                </View>
                {emptyReason === "category" ? (
                  <>
                    <Text style={styles.emptyTitle}>No hay jugadores en esta categoría</Text>
                    <Text style={styles.emptySubtitle}>Selecciona otra categoría o consulta todas.</Text>
                  </>
                ) : emptyReason === "activeStatus" ? (
                  <>
                    <Text style={styles.emptyTitle}>No hay jugadores activos</Text>
                    <Text style={styles.emptySubtitle}>Puedes consultar los jugadores inactivos cambiando el filtro de estado.</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>No encontramos jugadores</Text>
                    <Text style={styles.emptySubtitle}>Ajusta la búsqueda o los filtros para ver otros jugadores.</Text>
                  </>
                )}
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const state = sportState[item.id];
          const position = state?.position ?? null;
          const name = item.profiles?.full_name ?? "Sin nombre";
          return (
            <TouchableOpacity style={styles.row} onPress={() => setSelectedMember(item)} activeOpacity={0.7}>
              <PlayerSportAvatar
                player={{ id: item.profile_id, ...item.profiles }}
                size="sm"
                sportCategory={state?.category ?? null}
                rankingPosition={position}
              />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {state?.category ?? "—"} • {position !== null ? `#${position}` : "—"} • {state?.points ?? 0} pts
                </Text>
              </View>
              <Text style={[styles.rowStatus, { color: item.is_active ? theme.colors.success : theme.colors.muted }]}>
                {item.is_active ? "Activo" : "Inactivo"}
              </Text>
              <ChevronRight width={16} height={16} color="rgba(148,163,184,0.4)" />
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <FilterMenu
        visible={statusMenuOpen}
        onClose={() => setStatusMenuOpen(false)}
        options={PLAYERS_STATUS_OPTIONS}
        value={statusFilter}
        onSelect={(v) => setStatusFilter(v as PlayersStatusFilter)}
      />
      <FilterMenu
        visible={categoryMenuOpen}
        onClose={() => setCategoryMenuOpen(false)}
        options={categoryOptions}
        value={categoryFilter}
        onSelect={setCategoryFilter}
      />

      <PlayerDetailSheet member={selectedMember} sportState={selectedMember ? sportState[selectedMember.id] : undefined} onClose={() => setSelectedMember(null)} />
    </SafeAreaView>
  );
}

// Equivalente RN de FilterDropdown.tsx (app web) — la web abre un popover
// anclado al botón; en RN, sin medición de layout de por medio, el mismo
// mecanismo se resuelve con un modal simple con las mismas opciones y el
// mismo check en la seleccionada.
function FilterMenu({
  visible,
  onClose,
  options,
  value,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuCard}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={styles.menuItem}
              onPress={() => {
                onSelect(opt.value);
                onClose();
              }}
            >
              <Text style={styles.menuItemText}>{opt.label}</Text>
              {opt.value === value && <Check width={14} height={14} color={theme.colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  h1: { color: theme.colors.white, fontSize: 26, fontWeight: "800" },
  subtitle: { color: theme.colors.muted, fontSize: 13, marginTop: 4 },
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
  searchInput: { flex: 1, color: theme.colors.white, fontSize: 15 },
  filtersRow: { flexDirection: "row", gap: 8 },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  filterPillActive: { backgroundColor: `${theme.colors.primary}26`, borderColor: `${theme.colors.primary}4D` },
  filterPillText: { fontSize: 12, fontWeight: "500", color: theme.colors.muted },
  filterPillTextActive: { color: theme.colors.primary },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: "500", color: theme.colors.white },
  rowMeta: { fontSize: 12, color: "rgba(148,163,184,0.7)", marginTop: 2 },
  rowStatus: { fontSize: 12, fontWeight: "500" },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 4 },
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
  emptySubtitle: { fontSize: 12, color: theme.colors.muted, textAlign: "center" },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 },
  menuCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#0e3347",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 14, color: theme.colors.white },
});
