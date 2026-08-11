import { useCallback, useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bell, ChevronDown } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { supabase } from "../lib/supabase";
import { getUnreadNotificationCount } from "../lib/notifications";
import { clubRoleLabel } from "../lib/roleLabels";
import { theme } from "../lib/theme";

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Traducción 1:1 de la barra superior mobile de AppNav.tsx (app web) —
// misma composición: logo/nombre/rol del club a la izquierda, campana con
// badge + selector de usuario a la derecha. Montada una sola vez sobre el
// tab navigator (RootNavigator.tsx), visible en todas las pantallas —
// nunca reimplementada por screen, igual que en la web (un solo AppNav
// para todo el club). El menú de usuario completo (Mi Perfil/Cambiar de
// club/Crear otro club) y el dropdown de notificaciones no se replican
// (son módulos aparte, "Perfil"/"Notificaciones", fuera de alcance de este
// slice) — el pill de usuario cierra sesión directo y la campana muestra
// un aviso mínimo, siguiendo la misma regla de placeholder que los tabs
// no implementados.
export function AppHeader() {
  const { club, role, identity } = useClub();
  const { signOut } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnread = useCallback(async () => {
    const count = await getUnreadNotificationCount(supabase);
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  if (!club) return null;

  const roleLabel = role ? clubRoleLabel(role) : "";
  // Idéntico a getDisplayName en AppNav.tsx (app web) — nombre completo tal
  // cual está guardado (nunca solo el primer nombre), con el mismo
  // fallback a la parte local del email cuando no hay nombre real.
  const identitySource = identity?.name || identity?.email || "";
  const displayName = identitySource.includes("@") ? identitySource.slice(0, identitySource.indexOf("@")) || "Usuario" : identitySource || "Usuario";

  function handleUserPress() {
    Alert.alert(displayName || "Cuenta", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: signOut },
    ]);
  }

  function handleBellPress() {
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
});
