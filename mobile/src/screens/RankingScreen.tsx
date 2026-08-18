import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronDown, Check, Star, Trophy } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useClub } from "../contexts/ClubContext";
import { getSportCategories, type SportCategoryRow } from "../lib/players";
import {
  getInitialRankingCategory,
  getCategoryRanking,
  computeRankingPresentation,
  buildRankingWhatsappMessage,
  type RankingRow,
} from "../lib/ranking";
import { SITE_URL } from "../lib/reservationShare";
import { PlayerSportAvatar } from "../components/PlayerSportAvatar";
import { RankMedalCrown } from "../components/RankMedalCrown";
import { ShareActions } from "../components/ShareActions";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";

// Alineado con TournamentPodium.tsx (mobile, "Podio final" de Torneos) —
// mismo lenguaje visual de bloque único: UN solo pedestal por lugar (nunca
// "card + base separada"), altura por lugar (PEDESTAL_HEIGHT) y toda la
// fila alineada por su borde inferior (podiumRow: alignItems "flex-end"),
// así el pedestal más alto del 1.º queda visualmente más arriba sin
// necesitar una columna más ancha — igual que Torneos, las tres columnas
// son flex:1 parejo, la jerarquía viene de la altura/tamaños, nunca del
// ancho. A diferencia de Torneos (altura variable vía minHeight, válido
// ahí porque el contenido de una dupla es más uniforme), aquí la altura es
// FIJA y con overflow:hidden (ver PEDESTAL_HEIGHT) — un jugador individual
// trae nombre de longitud variable y a veces el badge "Tú", y ese
// contenido nunca debe poder estirar el bloque y romper 1>2>3 (bug real:
// un nombre largo en el 3er puesto hacía que su pedestal terminara más
// alto que el del 1º). A diferencia de Torneos (que usa un único tinte
// ámbar para los tres lugares), Ranking conserva sus propios colores
// oro/plata/bronce por lugar — un jugador individual, no una dupla, así
// que nunca corresponde la semántica de "pairLabel"/avatares apilados de
// Torneos.
const MEDAL_COLOR = { 1: "#FBBF24", 2: "#CBD5E1", 3: "#FB923C" } as const;
// Altura FIJA (no minHeight): el bloque debe medir siempre exactamente esto,
// nunca más, para que la jerarquía 1>2>3 sea puramente geométrica y nunca
// dependa de cuánto contenido (nombre largo, badge "Tú", etc.) haya adentro
// — ver pedestal.overflow:"hidden" en los estilos, que recorta ese
// contenido en vez de dejar que estire el bloque. Valores con margen sobre
// el contenido real (avatar+badge+nombre a 2 líneas+puntos) para que el
// recorte sea la excepción, no la norma.
const PEDESTAL_HEIGHT = { 1: 196, 2: 170, 3: 148 } as const;
const AVATAR_SIZE: Record<1 | 2 | 3, "sm" | "md"> = { 1: "md", 2: "sm", 3: "sm" };
const BADGE_SIZE = { 1: 26, 2: 20, 3: 20 } as const;

// Traducción 1:1 de PodiumCard en RankingView.tsx (app web), con la
// estructura de bloque único de TournamentPodium.tsx (mobile) — mismo
// orden visual 2º→1º→3º (el caller pasa `place` ya reordenado, ver
// PODIUM_DISPLAY_ORDER abajo), misma corona solo sobre el 1º, mismo badge
// "Tú", mismos puntos, categoría vía la esquina de PlayerSportAvatar
// (nunca una línea de texto aparte). Nunca clickeable en PLAYER — WEB
// tampoco lo permite para este rol (isAdmin gate en RankingView), así que
// no hay ningún subflujo de "abrir jugador" que replicar aquí.
function PodiumCard({ place, row, category, isSelf }: { place: 1 | 2 | 3; row: RankingRow; category: string; isSelf: boolean }) {
  const color = MEDAL_COLOR[place];
  return (
    <View style={styles.column}>
      {place === 1 && <RankMedalCrown place={1} size={18} />}
      <View
        style={[
          styles.pedestal,
          { height: PEDESTAL_HEIGHT[place], backgroundColor: `${color}1A`, borderColor: `${color}59` },
        ]}
      >
        <View style={[styles.podiumBadge, { width: BADGE_SIZE[place], height: BADGE_SIZE[place], backgroundColor: color }]}>
          <Text style={styles.podiumBadgeText}>{place}</Text>
        </View>
        {/* Sin rankingPosition aquí: el podio ya comunica la posición con
            su propio número/pedestal/corona — igual que WEB. Envuelto en
            un View propio: PlayerSportAvatar fija alignSelf:"flex-start"
            en su raíz (pensado para filas horizontales, como el listado
            de más abajo) — dentro de un pedestal en columna eso lo
            desplazaba hacia el borde izquierdo en vez de centrarlo. Este
            wrapper, sin ancho propio, se ajusta al contenido y queda
            centrado por el pedestal; el avatar interno ya no tiene
            espacio hacia el que desplazarse, sin tocar
            PlayerSportAvatar.tsx (usado tal cual en el listado y en el
            resto de la app). */}
        <View style={styles.podiumAvatarWrap}>
          <PlayerSportAvatar
            player={{ id: row.profile_id, full_name: row.full_name, avatar_url: row.avatar_url }}
            size={AVATAR_SIZE[place]}
            sportCategory={category}
          />
        </View>
        <View style={styles.podiumNameRow}>
          <Text style={styles.podiumName} numberOfLines={2}>
            {row.full_name ?? "Jugador"}
          </Text>
          {isSelf && (
            <View style={styles.selfBadge}>
              <Text style={styles.selfBadgeText}>Tú</Text>
            </View>
          )}
        </View>
        <Text style={styles.podiumPoints}>{row.current_points} pts</Text>
      </View>
    </View>
  );
}

const PODIUM_DISPLAY_ORDER: { place: 1 | 2 | 3; index: 0 | 1 | 2 }[] = [
  { place: 2, index: 1 },
  { place: 1, index: 0 },
  { place: 3, index: 2 },
];

// Equivalente RN de FilterDropdown.tsx (app web) — mismo patrón ya
// establecido en PlayersScreen.tsx (FilterMenu): la web abre un popover
// anclado al botón, en RN sin medición de layout se resuelve con un modal
// simple con las mismas opciones y el mismo check en la seleccionada.
function CategoryPickerModal({
  visible,
  categories,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  categories: SportCategoryRow[];
  value: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuCard}>
          {categories.map((c) => (
            <TouchableOpacity key={c.code} style={styles.menuItem} onPress={() => onSelect(c.code)}>
              <Text style={styles.menuItemText}>{c.code}</Text>
              {c.code === value && <Check width={14} height={14} color={theme.colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function RankingRowSkeleton() {
  return (
    <View style={{ gap: 8 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton style={{ width: 20, height: 14, borderRadius: 4 }} />
          <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
          <Skeleton style={{ flex: 1, height: 14, borderRadius: 4 }} />
          <Skeleton style={{ width: 24, height: 14, borderRadius: 4 }} />
        </View>
      ))}
    </View>
  );
}

// Equivalente nativo de RankingView.tsx (app web) — PLAYER-only (mobile no
// tiene rol OWNER/ADMIN en su tab bar de Ranking, ver AppTabs.tsx). Nunca
// clickeable (el "Miembro del club" que WEB abre para isAdmin no aplica a
// PLAYER, que ya no lo veía tampoco en WEB) y sin acciones administrativas.
// Reutiliza get_club_category_ranking_view/get_club_member_sport_state
// (ya usadas por mobile en players.ts/TournamentDetailScreen.tsx) y
// computeRankingPresentation/buildRankingWhatsappMessage
// (shared/players/ranking.ts, misma fuente que RankingView.tsx en WEB) —
// ninguna regla de posiciones/empates/categoría se recalcula aquí.
export function RankingScreen() {
  const { club, clubMemberId } = useClub();

  const [categories, setCategories] = useState<SportCategoryRow[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadInitial = useCallback(async () => {
    if (!club) return;
    const cats = await getSportCategories(supabase);
    setCategories(cats);
    const initialCategory = await getInitialRankingCategory(supabase, club.id, clubMemberId, cats);
    setCategory(initialCategory);
    if (initialCategory) {
      const result = await getCategoryRanking(supabase, club.id, initialCategory);
      setRows(result.rows);
      setError(result.error ? "No se pudo cargar el ranking. Intenta de nuevo." : null);
    }
  }, [club, clubMemberId]);

  useEffect(() => {
    if (!club) return;
    setLoading(true);
    loadInitial().finally(() => setLoading(false));
  }, [club, loadInitial]);

  async function fetchRanking(targetCategory: string) {
    if (!club) return;
    setRankingLoading(true);
    setError(null);
    const result = await getCategoryRanking(supabase, club.id, targetCategory);
    setRankingLoading(false);
    if (result.error) {
      setError("No se pudo cargar el ranking. Intenta de nuevo.");
      setRows([]);
      return;
    }
    setRows(result.rows);
  }

  function handleCategoryChange(nextCategory: string) {
    setCategory(nextCategory);
    setPickerOpen(false);
    fetchRanking(nextCategory);
  }

  async function handleRefresh() {
    if (!category) return;
    setRefreshing(true);
    await fetchRanking(category);
    setRefreshing(false);
  }

  if (!club) return null;

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.content}>
          <Skeleton style={{ height: 28, width: "40%" }} />
          <Skeleton style={{ height: 60, borderRadius: 16 }} />
          <Skeleton style={{ height: 40, borderRadius: 12 }} />
          <RankingRowSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  const { sortedRows, allTied, podiumRows, tableRows, ownRow } = computeRankingPresentation(rows, clubMemberId);
  const showReady = !rankingLoading && !error && sortedRows.length > 0;
  const shareMessage = category
    ? buildRankingWhatsappMessage({ category, clubName: club.name, clubSlug: club.slug, siteUrl: SITE_URL })
    : "";
  const shareUrl = `${SITE_URL}/clubs/${club.slug}/ranking`;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <FlatList
        data={tableRows}
        keyExtractor={(r) => r.club_member_id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View>
              <Text style={styles.h1}>Ranking</Text>
              <Text style={styles.subtitle}>Clasificación vigente por categoría.</Text>
            </View>

            {/* Tu posición — misma condición que WEB (showReady && ownRow):
                nunca aparece si el jugador no tiene fila en la categoría
                actualmente vista. */}
            {showReady && ownRow && (
              <View style={styles.ownCard}>
                <View style={styles.ownHeaderRow}>
                  <Star width={13} height={13} color={theme.colors.warning} />
                  <Text style={styles.ownLabel}>Tu posición</Text>
                </View>
                <Text style={styles.ownPosition}>
                  #{ownRow.ranking_position} de {sortedRows.length}
                </Text>
                <Text style={styles.ownPoints}>{ownRow.current_points} puntos</Text>
              </View>
            )}

            {/* Compartir Ranking — mismo mensaje exacto que WEB construye
                (buildRankingWhatsappMessage), mismo enlace público. WEB
                genera además una imagen PNG (html-to-image, librería de
                DOM sin equivalente en React Native) — mobile reutiliza el
                mecanismo de compartir ya establecido en el resto de la app
                (ShareActions: WhatsApp vía api.whatsapp.com + copiar
                enlace), nunca un copy/enlace inventado. */}
            {showReady && category && (
              <View style={styles.shareBlock}>
                <Text style={styles.shareLabel}>Compartir Ranking</Text>
                <ShareActions url={shareUrl} message={shareMessage} compact />
              </View>
            )}

            {category === null ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>El catálogo de categorías todavía no está disponible.</Text>
              </View>
            ) : (
              <>
                <View>
                  <TouchableOpacity style={styles.categoryButton} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
                    <Text style={styles.categoryButtonLabel}>Categoría</Text>
                    <View style={styles.categoryButtonValueRow}>
                      <Text style={styles.categoryButtonValue}>{category}</Text>
                      <ChevronDown width={14} height={14} color={theme.colors.muted} />
                    </View>
                  </TouchableOpacity>
                  {showReady && (
                    <Text style={styles.countText}>
                      {sortedRows.length} {sortedRows.length === 1 ? "jugador" : "jugadores"} en la categoría {category}
                    </Text>
                  )}
                </View>

                {rankingLoading ? (
                  <RankingRowSkeleton />
                ) : error ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : sortedRows.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Trophy width={20} height={20} color={theme.colors.muted} />
                    <Text style={styles.emptyText}>Todavía no hay jugadores en la categoría {category}.</Text>
                  </View>
                ) : allTied ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>Aún no hay una clasificación definida.</Text>
                    <Text style={styles.emptyText}>Todos los jugadores comienzan con 0 puntos.</Text>
                  </View>
                ) : (
                  podiumRows && (
                    <View style={styles.podiumRow}>
                      {PODIUM_DISPLAY_ORDER.map(({ place, index }) => {
                        const row = podiumRows[index];
                        return (
                          <PodiumCard key={row.club_member_id} place={place} row={row} category={category} isSelf={row.club_member_id === clubMemberId} />
                        );
                      })}
                    </View>
                  )
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isSelf = item.club_member_id === clubMemberId;
          return (
            <View style={[styles.row, isSelf && styles.rowSelf]}>
              <Text style={styles.rowPosition}>{item.ranking_position}</Text>
              <PlayerSportAvatar
                player={{ id: item.profile_id, full_name: item.full_name, avatar_url: item.avatar_url }}
                size="sm"
                sportCategory={category ?? undefined}
                rankingPosition={item.ranking_position}
              />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.full_name ?? "Jugador"}
                </Text>
                {isSelf && (
                  <View style={styles.selfBadge}>
                    <Text style={styles.selfBadgeText}>Tú</Text>
                  </View>
                )}
              </View>
              <Text style={styles.rowPoints}>{item.current_points}</Text>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
      />

      <CategoryPickerModal
        visible={pickerOpen}
        categories={categories}
        value={category}
        onSelect={handleCategoryChange}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 32, gap: 8 },
  h1: { color: theme.colors.white, fontSize: 26, fontWeight: "800" },
  subtitle: { color: theme.colors.muted, fontSize: 13, marginTop: 4 },
  ownCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 14,
    alignSelf: "flex-start",
    minWidth: 160,
  },
  ownHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ownLabel: { color: theme.colors.muted, fontSize: 12 },
  ownPosition: { color: theme.colors.primary, fontSize: 18, fontWeight: "800", marginTop: 4 },
  ownPoints: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  shareBlock: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 8,
  },
  shareLabel: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
  categoryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  categoryButtonLabel: { color: theme.colors.muted, fontSize: 12 },
  categoryButtonValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  categoryButtonValue: { color: theme.colors.white, fontSize: 15, fontWeight: "700" },
  countText: { color: theme.colors.muted, fontSize: 12, marginTop: 8 },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 32,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
  },
  emptyTitle: { color: theme.colors.white, fontSize: 14, fontWeight: "600", textAlign: "center" },
  emptyText: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  errorText: { color: theme.colors.danger, fontSize: 13, textAlign: "center" },
  // Misma estructura/ritmo que TournamentPodium.tsx (mobile): fila
  // alineada por el borde inferior (flex-end) + columnas parejas
  // (flex:1) + UN pedestal por lugar de altura variable — la jerarquía
  // 1º/2º/3º viene de esa altura y del tamaño de avatar/badge, nunca de
  // un ancho de columna distinto.
  podiumRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  column: { flex: 1, alignItems: "center", minWidth: 0, gap: 6 },
  pedestal: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
    // Recorta cualquier contenido interno que exceda la altura fija de
    // arriba (nombre muy largo a 2 líneas + badge "Tú" al mismo tiempo, el
    // peor caso) en vez de dejar que el bloque crezca y rompa la
    // jerarquía 1>2>3.
    overflow: "hidden",
  },
  podiumBadge: { borderRadius: theme.radius.full, alignItems: "center", justifyContent: "center" },
  // Ver comentario junto a su uso en PodiumCard — neutraliza el
  // alignSelf:"flex-start" propio de PlayerSportAvatar dentro de este
  // pedestal en columna, sin modificar ese componente compartido.
  podiumAvatarWrap: { alignSelf: "center" },
  podiumBadgeText: { color: theme.colors.bg, fontSize: 11, fontWeight: "800" },
  podiumNameRow: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%", flexWrap: "wrap", justifyContent: "center" },
  podiumName: { color: theme.colors.white, fontSize: 12, fontWeight: "700", textAlign: "center", flexShrink: 1 },
  podiumPoints: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
  selfBadge: {
    backgroundColor: `${theme.colors.primary}26`,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}40`,
    borderRadius: theme.radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  selfBadgeText: { color: theme.colors.primary, fontSize: 9, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowSelf: { backgroundColor: `${theme.colors.primary}0D` },
  rowPosition: { width: 24, textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700" },
  rowInfo: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { color: theme.colors.white, fontSize: 14, flexShrink: 1 },
  rowPoints: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  rowSeparator: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 },
  menuCard: {
    width: "100%",
    maxWidth: 320,
    maxHeight: "70%",
    backgroundColor: "#0e3347",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 14, color: theme.colors.white },
});
