import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Bell, ChevronLeft } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { getNotificationsPaginated, formatRelativeNotificationTime, type NotificationRow } from "../lib/notifications";
import { markNotificationRead, markAllNotificationsRead } from "../lib/notificationActions";
import { resolveNotificationTarget, buildTabNav } from "../lib/notificationNav";
import { updateLastClub } from "../lib/clubSwitcher";
import { Skeleton } from "../components/Skeleton";
import { theme } from "../lib/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { navigateIntoApp } from "../navigation/navigateIntoApp";

const PAGE_SIZE = 20;

// Puerto RN de /notifications (app web, NotificationsListClient.tsx) — la
// vista completa, no el dropdown de campana (que en mobile es directo el
// badge de AppHeader, sin panel propio, ver ese archivo). Mismo query
// paginado (getNotificationsPaginated), mismas dos mutaciones
// (markNotificationRead/markAllNotificationsRead), mismo formato de fecha
// relativa — nunca una segunda implementación de ninguna de las tres.
//
// A diferencia de WEB (cada notificación ya es una URL autosuficiente),
// esta pantalla puede necesitar cambiar el club activo antes de navegar —
// ver ClubContext.tsx → pendingNav y notificationNav.ts para el porqué.
export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const { club: currentClub, reload: reloadClub, setPendingNav, setPendingRootNav } = useClub();
  const userId = session?.user.id ?? null;

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { items: rows, hasMore: more } = await getNotificationsPaginated(supabase, { limit: PAGE_SIZE, offset: 0 });
    setItems(rows);
    setHasMore(more);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const { items: nextItems, hasMore: nextHasMore } = await getNotificationsPaginated(supabase, { limit: PAGE_SIZE, offset: items.length });
    setItems((prev) => [...prev, ...nextItems]);
    setHasMore(nextHasMore);
    setLoadingMore(false);
  }

  // Optimista, igual que la web: la fila cambia de estado al instante, la
  // mutación real corre en segundo plano. El badge de AppHeader se
  // actualiza por su propia suscripción Realtime a esta misma tabla — no
  // hay un segundo canal de sincronización que inventar aquí.
  function markRead(n: NotificationRow) {
    if (n.read_at || !userId) return;
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
    markNotificationRead(supabase, userId, n.id);
  }

  function handleMarkAllRead() {
    if (!userId) return;
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    markAllNotificationsRead(supabase, userId);
  }

  async function handleItemPress(n: NotificationRow) {
    markRead(n);

    const target = resolveNotificationTarget(n);
    if (target.kind === "none") return;

    if (target.kind === "change_club") {
      navigation.navigate("ChangeClub");
      return;
    }

    setNavigatingId(n.id);
    try {
      const crossClub = !!n.club_id && n.club_id !== currentClub?.id;

      // ReservationDetail vive en el stack raíz (RootNavigator.tsx), no
      // dentro de ReservasTab/ReservationsStack — un push real y directo
      // sobre navigation (ya NativeStackNavigationProp<RootStackParamList>)
      // en vez de rutear a través del Tab Navigator.
      if (target.kind === "reservation_detail") {
        if (crossClub && n.club_id && userId) {
          // Cross-club: NO navegar acá. AppTabs se remonta cuando cambia
          // club.id (key={club?.id} en AppShell) — un navigate() inmediato
          // después de este await corre en carrera contra ese remonte y
          // puede perderse. setPendingRootNav lo deja para el único
          // consumer (el useEffect en PushNotificationNavigator, siempre
          // montado, nunca se remonta con el club) — nunca navegamos acá
          // directo ni duplicamos ese efecto.
          setPendingRootNav({ screen: "ReservationDetail", params: { id: target.reservationId } });
          try {
            await updateLastClub(supabase, userId, n.club_id);
          } catch {
            // Best-effort, igual que el resto de la app — nunca bloquea seguir.
          }
          await reloadClub();
          return;
        }
        navigation.navigate("ReservationDetail", { id: target.reservationId });
        return;
      }

      if (crossClub && n.club_id && userId) {
        const navSpec = await buildTabNav(supabase, target, n.club_id);
        if (navSpec) setPendingNav(navSpec);
        try {
          await updateLastClub(supabase, userId, n.club_id);
        } catch {
          // Best-effort, igual que el resto de la app — nunca bloquea seguir.
        }
        await reloadClub();
        navigateIntoApp(navigation);
        return;
      }

      if (!currentClub) return;
      const navSpec = await buildTabNav(supabase, target, currentClub.id);
      navigateIntoApp(
        navigation,
        navSpec ? { screen: navSpec.tab, params: navSpec.screen ? { screen: navSpec.screen, params: navSpec.params } : undefined } : undefined
      );
    } finally {
      setNavigatingId(null);
    }
  }

  const unreadCount = items.filter((n) => !n.read_at).length;

  // Antes había una "X" (cerrar) separada de la navegación real — misma
  // acción de salida que un back, así que se reemplaza por una sola flecha
  // en vez de dos controles redundantes. canGoBack() es la señal correcta
  // aquí (a diferencia de WEB, que no tiene un equivalente confiable):
  // "Notifications" vive en el Stack raíz (RootNavigator.tsx) como modal
  // sobre "App", así que casi siempre hay una pantalla previa a la que
  // volver (goBack() la revela con su estado intacto, tab activo
  // incluido). Solo cae al Dashboard (navigateIntoApp sin target → primer
  // tab de OwnerAdminTabs/PlayerTabs, "HomeTab" en ambos) cuando
  // Notifications es la propia raíz del stack — entrada directa/deep link
  // sin "App" montado debajo.
  function handleBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigateIntoApp(navigation);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.backButton} accessibilityLabel="Volver">
          <ChevronLeft width={24} height={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificaciones</Text>
      </View>

      {loading ? (
        <View style={styles.loadingList}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 72, borderRadius: theme.radius.lg }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            unreadCount > 0 ? (
              <View style={styles.markAllRow}>
                <TouchableOpacity onPress={handleMarkAllRead}>
                  <Text style={styles.markAllText}>Marcar todas como leídas</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Bell width={22} height={22} color={theme.colors.muted} />
              </View>
              <Text style={styles.emptyTitle}>No tienes notificaciones todavía.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const unread = !item.read_at;
            const isNavigating = navigatingId === item.id;
            return (
              <TouchableOpacity
                style={[styles.row, unread && styles.rowUnread]}
                disabled={isNavigating}
                onPress={() => handleItemPress(item)}
              >
                <View style={[styles.dot, unread && styles.dotUnread]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.rowTopLine}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowTime}>{formatRelativeNotificationTime(item.created_at)}</Text>
                  </View>
                  <Text style={styles.rowMessage} numberOfLines={3}>
                    {item.message}
                  </Text>
                  {!!item.clubs && <Text style={styles.rowClub}>{item.clubs.name}</Text>}
                </View>
                {isNavigating && <ActivityIndicator color={theme.colors.muted} size="small" />}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator color={theme.colors.muted} size="small" />
                ) : (
                  <Text style={styles.loadMoreText}>Cargar más</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { color: theme.colors.white, fontSize: 18, fontWeight: "700" },
  backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  loadingList: { padding: 16, gap: 8 },
  listContent: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  markAllRow: { alignItems: "flex-end", marginBottom: 10 },
  markAllText: { color: theme.colors.primary, fontSize: 13, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowUnread: { backgroundColor: `${theme.colors.primary}0D`, borderColor: `${theme.colors.primary}33` },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: "transparent" },
  dotUnread: { backgroundColor: theme.colors.primary },
  rowTopLine: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  rowTitle: { flex: 1, color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  rowTime: { color: "rgba(148,163,184,0.6)", fontSize: 11, flexShrink: 0 },
  rowMessage: { color: theme.colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowClub: { color: "rgba(148,163,184,0.6)", fontSize: 11, marginTop: 6 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  loadMoreButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: { color: theme.colors.muted, fontSize: 13, fontWeight: "600" },
});
