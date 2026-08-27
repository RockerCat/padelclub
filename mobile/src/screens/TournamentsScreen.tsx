import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Plus, Trophy } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useClub } from "../contexts/ClubContext";
import {
  ADMIN_TAB_ORDER,
  getTournamentsForClub,
  resolveDefaultTab,
  tournamentsForTab,
  type SportCategoryOption,
  type TabKey,
} from "../lib/tournaments";
import { CompactCarouselCard } from "../components/CompactCarouselCard";
import { TournamentFormModal } from "../components/TournamentFormModal";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";
import type { Tournament } from "../types/domain";
import type { TournamentsStackParamList } from "../navigation/TournamentsStack";

// Grid de resultados de esta pantalla (única superficie que lo usa) — 2
// columnas fijas, ancho de card calculado desde el ancho real de
// pantalla, nunca un valor hardcodeado que solo funcione en un dispositivo
// de prueba. GRID_SIDE_INSET coincide con el padding horizontal real de
// `content` (16) — mismo margen lateral que ya usa el resto de la
// pantalla (header, tabs). Distinto de los carruseles horizontales de
// ClubHomeScreen.tsx/MyTournamentsSection.tsx (Dashboard), que NO cambian
// en esta tarea y mantienen sus propias constantes locales sin tocar.
const GRID_GAP = 12;
const GRID_SIDE_INSET = 16;

// Traducción 1:1 de src/app/(app)/[club]/admin/tournaments/page.tsx +
// TournamentsGrid.tsx (app web, rama OWNER/ADMIN): mismo header
// título/copy/botón, mismos 7 tabs en el mismo orden (ADMIN_TAB_ORDER),
// mismo resolveDefaultTab, mismo filtrado tournamentsForTab, mismos 2
// empty states (cero torneos en el club vs. cero en el tab activo).
// Presentación de resultados: grid de 2 columnas (CompactCarouselCard, la
// misma card compacta ya usada en ClubHomeScreen.tsx/
// MyTournamentsSection.tsx), con scroll vertical normal de la pantalla —
// esta pantalla está dedicada exclusivamente a explorar torneos, a
// diferencia de esas otras dos superficies (secciones secundarias dentro
// de una pantalla más grande), que siguen usando su carrusel horizontal
// sin cambios. El tab/filtro activo ya comunica el estado (Abiertas/
// Cerradas/En vivo/Finalizadas), igual que las secciones "Torneos
// activos"/"Torneos finalizados" de ClubHome, así que un badge de estado
// por card sería redundante dentro del mismo tab. Tocar una card sigue
// navegando al detalle real (TournamentDetailScreen); "Crear torneo"
// sigue abriendo el mismo RPC create_tournament vía TournamentFormModal
// (modo creación).
export function TournamentsScreen() {
  // NOTA: esta pantalla sigue siendo el mismo listado ADMIN-only de
  // siempre (con "Crear torneo" y los 7 tabs de ADMIN_TAB_ORDER visibles
  // para cualquier rol que entre acá — un gap real y separado, ya
  // reconocido, de portar el rol correcto a esta lista; fuera de alcance
  // de este ajuste puntual).
  const { club } = useClub();
  const navigation = useNavigation<NativeStackNavigationProp<TournamentsStackParamList, "TournamentsList">>();
  const { width: windowWidth } = useWindowDimensions();
  // 2 columnas: ancho disponible = ancho de pantalla - los dos márgenes
  // laterales (GRID_SIDE_INSET) - el gap entre columnas, dividido en 2.
  const gridCardWidth = Math.floor((windowWidth - GRID_SIDE_INSET * 2 - GRID_GAP) / 2);

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
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
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

            {tournamentsInTab.length === 0 ? (
              <Text style={styles.emptyTabText}>No hay torneos en este estado.</Text>
            ) : (
              <View style={styles.grid}>
                {tournamentsInTab.map((item) => (
                  <CompactCarouselCard
                    key={item.id}
                    imageUrl={item.cover_image_url}
                    title={item.name}
                    width={gridCardWidth}
                    onPress={() => navigation.navigate("TournamentDetail", { tournamentId: item.id })}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {creating && club && (
        <TournamentFormModal clubId={club.id} categories={categories} onClose={() => setCreating(false)} onSuccess={handleCreateSuccess} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  // Grid de 2 columnas — flexWrap + gap (fila y columna) hace crecer el
  // listado verticalmente dentro del mismo ScrollView de la pantalla,
  // nunca una lista/carrusel con su propio scroll interno.
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
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
