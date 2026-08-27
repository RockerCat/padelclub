import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { theme } from "../lib/theme";

const WEB_URL = "https://mipadel.club/auth/login";

// Pantalla única para OWNER/ADMIN con club activo — V1 mobile no tiene
// dashboards ni pantallas operativas para estos roles (ver CLAUDE.md,
// Principle 4 y AppTabs.tsx: OwnerAdminTabs queda sin usar mientras esta
// pantalla intercepta antes en AuthenticatedNavigator, ver RootNavigator.tsx
// → OwnerAdminStack). La web sigue resolviendo login/rol/club exactamente
// como ya lo hace — este botón solo abre mipadel.club, nunca una ruta admin
// específica. Regla de producto V1: OWNER/ADMIN no cambia de club activo
// desde mobile — esta pantalla no ofrece esa acción (ver RootNavigator.tsx
// → OwnerAdminStack).
export function OwnerAdminWebScreen() {
  const { signOut } = useAuth();

  function confirmLogout() {
    Alert.alert("Cerrar sesión", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Administración del club</Text>
        <Text style={styles.text}>La administración de Mi Pádel Club está disponible desde la versión web.</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={() => Linking.openURL(WEB_URL)} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>Ir a MiPadel.club</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryAction} onPress={confirmLogout} activeOpacity={0.7}>
          <Text style={[styles.secondaryActionText, { color: theme.colors.danger }]}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  title: { color: theme.colors.white, fontSize: 20, fontWeight: "700", textAlign: "center" },
  text: { color: theme.colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  primaryButton: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  primaryButtonText: { color: theme.colors.bg, fontWeight: "700", fontSize: 15 },
  secondaryAction: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10 },
  secondaryActionText: { color: theme.colors.muted, fontWeight: "600", fontSize: 14 },
});
