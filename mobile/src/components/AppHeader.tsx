import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Bell, ChevronDown, LogOut, Repeat, User } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { supabase } from "../lib/supabase";
import { getUnreadNotificationCount } from "../lib/notifications";
import { clubRoleLabel } from "../lib/roleLabels";
import { theme } from "../lib/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

// Realtime es la vía principal de actualización en vivo del badge (mismo
// canal/tabla que NotificationBell.tsx en WEB: postgres_changes INSERT +
// UPDATE sobre `notifications`, filtrado por profile_id) — el poll y el
// refetch al volver a foreground (equivalente RN de focus/visibilitychange
// en WEB, vía AppState) son el respaldo obligatorio, nunca confiar solo en
// Realtime. A diferencia de NotificationBell.tsx, AppHeader monta una sola
// vez de verdad en mobile (no hay sidebar+topbar+drawer simultáneos como en
// responsive web), así que no hace falta el truco useId() de WEB para
// evitar colisiones de topic — un solo canal por usuario basta.
const POLL_INTERVAL_MS = 45_000;

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Traducción 1:1 de la barra superior mobile de AppNav.tsx (app web) —
// misma composición: logo/nombre/rol del club a la izquierda, campana con
// badge + selector de usuario a la derecha. Montada una sola vez sobre el
// tab navigator (RootNavigator.tsx → AppShell), visible en todas las
// pantallas — nunca reimplementada por screen, igual que en la web (un
// solo AppNav para todo el club).
//
// La campana: el conteo/badge es real y vivo para los tres roles (Realtime
// + poll + refetch en foreground, ver más abajo) — nunca un valor
// hardcodeado. El TAP solo abre el centro de notificaciones real
// (NotificationsScreen) para PLAYER; OWNER/ADMIN conservan exactamente el
// Alert "Disponible próximamente" de antes (esta pasada está acotada a
// PLAYER MOBILE — ver CLAUDE.md, "no cambiar OWNER/ADMIN salvo shared
// estrictamente necesario"; el badge en sí SÍ es shared porque vivir en
// AppHeader lo exige, y volverlo vivo para los tres roles es una mejora
// pura, nunca un cambio de comportamiento observable para ellos).
//
// El pill de usuario: para PLAYER abre el menú de 3 opciones (Mi Perfil/
// Cambiar de club/Salir, ver UserMenu abajo) — mismo mínimo que el menú de
// usuario PLAYER de AppNav.tsx (app web). OWNER/ADMIN conservan exactamente
// el comportamiento anterior (Alert directo con "Cerrar sesión") sin
// cambios — "Cambiar de club" para ellos es un flujo distinto en WEB (el
// modal de switch-en-línea de OWNER, o el mismo /clubs de ADMIN) que esta
// pasada, acotada a PLAYER MOBILE, no toca.
function UserMenu({
  open,
  onClose,
  onOpenProfile,
  onOpenChangeClub,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenChangeClub: () => void;
  onLogout: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuSheet}>
          <TouchableOpacity style={styles.menuItem} onPress={onOpenProfile}>
            <User width={18} height={18} color={theme.colors.white} />
            <Text style={styles.menuItemText}>Mi Perfil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={onOpenChangeClub}>
            <Repeat width={18} height={18} color={theme.colors.white} />
            <Text style={styles.menuItemText}>Cambiar de club</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={onLogout}>
            <LogOut width={18} height={18} color={theme.colors.danger} />
            <Text style={[styles.menuItemText, { color: theme.colors.danger }]}>Salir</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function AppHeader() {
  const { club, role, identity } = useClub();
  const { session, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const userId = session?.user.id ?? null;

  const loadUnread = useCallback(async () => {
    const count = await getUnreadNotificationCount(supabase);
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  // Refetch al volver a foreground — equivalente RN de los listeners
  // focus/visibilitychange de NotificationBell.tsx (WEB).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") loadUnread();
    });
    return () => subscription.remove();
  }, [loadUnread]);

  // Respaldo por polling — nunca confiar solo en Realtime, mismo intervalo
  // que WEB (POLL_INTERVAL_MS). Solo mientras la app está en foreground.
  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === "active") loadUnread();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadUnread]);

  // Realtime: cualquier notificación nueva (INSERT) o marcada leída en otra
  // pantalla (UPDATE — NotificationsScreen, "Marcar todas como leídas")
  // refetch de inmediato el conteo, en vez de esperar el próximo poll. RLS
  // (notifications_select_own) sigue siendo el límite real — este filtro es
  // solo relevancia, no seguridad. Mismo mecanismo exacto que WEB usa para
  // mantener sincronizados dos componentes independientes (campana ↔
  // /notifications) sin ningún estado compartido entre ellos.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${userId}` }, () => loadUnread())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `profile_id=eq.${userId}` }, () => loadUnread())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadUnread]);

  if (!club) return null;

  const roleLabel = role ? clubRoleLabel(role) : "";
  // Idéntico a getDisplayName en AppNav.tsx (app web) — nombre completo tal
  // cual está guardado (nunca solo el primer nombre), con el mismo
  // fallback a la parte local del email cuando no hay nombre real.
  const identitySource = identity?.name || identity?.email || "";
  const displayName = identitySource.includes("@") ? identitySource.slice(0, identitySource.indexOf("@")) || "Usuario" : identitySource || "Usuario";

  function confirmLogout() {
    Alert.alert(displayName || "Cuenta", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: signOut },
    ]);
  }

  function handleUserPress() {
    if (role === "PLAYER") {
      setMenuOpen(true);
      return;
    }
    confirmLogout();
  }

  function handleBellPress() {
    if (role === "PLAYER") {
      navigation.navigate("Notifications");
      return;
    }
    Alert.alert("Notificaciones", "Disponible próximamente.");
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.row}>
        <View style={styles.identity}>
          {club.logo_url ? (
            <Image source={{ uri: club.logo_url }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoFallbackText}>{getInitials(club.name).slice(0, 2)}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.clubName} numberOfLines={1}>
              {club.name}
            </Text>
            {!!roleLabel && (
              <Text style={styles.roleLabel} numberOfLines={1}>
                {roleLabel}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={handleBellPress} style={styles.bellButton} hitSlop={8}>
            <Bell width={20} height={20} color={theme.colors.white} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleUserPress} style={styles.userPill} hitSlop={6}>
            <Text style={styles.userPillText} numberOfLines={1}>
              {displayName}
            </Text>
            <ChevronDown width={14} height={14} color={theme.colors.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {role === "PLAYER" && (
        <UserMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onOpenProfile={() => {
            setMenuOpen(false);
            navigation.navigate("Profile");
          }}
          onOpenChangeClub={() => {
            setMenuOpen(false);
            navigation.navigate("ChangeClub");
          }}
          onLogout={() => {
            setMenuOpen(false);
            confirmLogout();
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.colors.surface },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  logoFallback: { backgroundColor: `${theme.colors.primary}22`, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: theme.colors.primary, fontWeight: "700", fontSize: 11 },
  clubName: { color: theme.colors.white, fontSize: 15, fontWeight: "700" },
  roleLabel: { color: theme.colors.muted, fontSize: 11, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  bellButton: { padding: 4 },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: theme.colors.white, fontSize: 9, fontWeight: "700" },
  userPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxWidth: 120,
  },
  userPillText: { color: theme.colors.white, fontSize: 13, fontWeight: "500", flexShrink: 1 },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 2,
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: theme.radius.md },
  menuItemText: { color: theme.colors.white, fontSize: 15, fontWeight: "600" },
});
