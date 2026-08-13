import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Plus, Trophy } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useClub } from "../contexts/ClubContext";
import {
  ADMIN_TAB_ORDER,
  effectivePlayerTournamentStatus,
  getTournamentsForClub,
  resolveDefaultTab,
  tournamentsForTab,
  type SportCategoryOption,
  type TabKey,
} from "../lib/tournaments";
import { TournamentCard } from "../components/TournamentCard";
import { TournamentFormModal } from "../components/TournamentFormModal";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";
import type { Tournament } from "../types/domain";
import type { TournamentsStackParamList } from "../navigation/TournamentsStack";

// Traducción 1:1 de src/app/(app)/[club]/admin/tournaments/page.tsx +
// TournamentsGrid.tsx (app web, rama OWNER/ADMIN): mismo header
// título/copy/botón, mismos 7 tabs en el mismo orden (ADMIN_TAB_ORDER),
// mismo resolveDefaultTab, mismo filtrado tournamentsForTab, misma
// grilla (1 columna en mobile — web ya cae a `grid-cols-1` a este ancho),
// mismos 2 empty states (cero torneos en el club vs. cero en el tab
// activo). Tocar una card navega al detalle real (TournamentDetailScreen);
// "Crear torneo" abre el mismo RPC create_tournament vía
// TournamentFormModal (modo creación).
export function TournamentsScreen() {
  // NOTA: esta pantalla sigue siendo el mismo listado ADMIN-only de
  // siempre (con "Crear torneo" y los 7 tabs de ADMIN_TAB_ORDER visibles
  // para cualquier rol que entre acá — un gap real y separado, ya
  // reconocido, de portar el rol correcto a esta lista, análogo al que ya
  // se corrigió en TournamentDetailScreen/EntriesSection; fuera de
  // alcance de este ajuste puntual). `role` se agrega acá únicamente para
  // que el badge de cada tarjeta muestre el estado EFECTIVO cuando quien
  // mira es PLAYER, igual que el resto de superficies PLAYER — ningún
  // otro comportamiento de esta pantalla cambia.
  const { club, role } = useClub();
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const navigation = useNavigation<NativeStackNavigationProp<TournamentsStackParamList, "TournamentsList">>();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [confirmedCountByTournamentId, setConfirmedCountByTournamentId] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<SportCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!club) return;
    const result = await getTournamentsForClub(supabase, club.id);
    setTournaments(result.tournaments);
    setConfirmedCountByTournamentId(result.confirmedCountByTournamentId);
    setCategories(result.categories);
    setActiveTab((prev) => prev ?? resolveDefaultTab(result.tournaments, ADMIN_TAB_ORDER));
  }, [club]);

  useEffect(() => {
    if (!club) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [club, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handleCreateSuccess(tournament: Tournament) {
    setCreating(false);
    load();
    navigation.navigate("TournamentDetail", { tournamentId: tournament.id });
  }

  if (loading || activeTab === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Skeleton style={{ height: 28, width: "40%" }} />
          <Skeleton style={{ height: 36, borderRadius: 12 }} />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 120, borderRadius: 16 }} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  const tournamentsInTab = tournamentsForTab(tournaments, activeTab);

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
        data={tournaments.length === 0 ? [] : tournamentsInTab}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h1}>Torneos</Text>
                <Text style={styles.subtitle}>Administra inscripciones, duplas y clasificación de tus torneos.</Text>
              </View>
              <TouchableOpacity style={styles.createButton} onPress={() => setCreating(true)}>
                <Plus width={16} height={16} color={theme.colors.bg} />
                <Text style={styles.createButtonText}>Crear torneo</Text>
              </TouchableOpacity>
            </View>

            {tournaments.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <Trophy width={20} height={20} color={theme.colors.muted} />
                </View>
                <Text style={styles.emptyTitle}>Aún no hay torneos</Text>
                <Text style={styles.emptySubtitle}>
                  Crea el primer torneo del club para administrar inscripciones, duplas y clasificación.
                </Text>
                <TouchableOpacity style={[styles.createButton, { marginTop: 16 }]} onPress={() => setCreating(true)}>
                  <Plus width={16} height={16} color={theme.colors.bg} />
                  <Text style={styles.createButtonText}>Crear torneo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
                  {ADMIN_TAB_ORDER.map(({ key, label }) => {
                    const isActive = activeTab === key;
                    return (
                      <TouchableOpacity key={key} onPress={() => setActiveTab(key)} style={[styles.tab, isActive && styles.tabActive]}>
                        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {tournamentsInTab.length === 0 && <Text style={styles.emptyTabText}>No hay torneos en este estado.</Text>}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TournamentCard
            tournament={item}
            confirmedCount={confirmedCountByTournamentId[item.id] ?? 0}
            onPress={() => navigation.navigate("TournamentDetail", { tournamentId: item.id })}
            displayStatus={isAdmin ? item.status : effectivePlayerTournamentStatus(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      {creating && club && (
        <TournamentFormModal clubId={club.id} categories={categories} onClose={() => setCreating(false)} onSuccess={handleCreateSuccess} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  h1: { color: theme.colors.white, fontSize: 26, fontWeight: "800" },
  subtitle: { color: theme.colors.muted, fontSize: 13, marginTop: 4 },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  createButtonText: { fontSize: 13, fontWeight: "600", color: theme.colors.bg },
  tabsRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  tab: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  tabText: { fontSize: 13, fontWeight: "500", color: theme.colors.muted },
  tabTextActive: { color: theme.colors.primary },
  emptyTabText: { fontSize: 13, color: theme.colors.muted, textAlign: "center", paddingVertical: 32 },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 4, paddingHorizontal: 16 },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: theme.colors.white },
  emptySubtitle: { fontSize: 13, color: theme.colors.muted, textAlign: "center", maxWidth: 280 },
});
