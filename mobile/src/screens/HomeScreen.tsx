import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { theme } from "../lib/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { OwnerDashboardScreen } from "./OwnerDashboardScreen";
import { PlayerDashboardScreen } from "./PlayerDashboardScreen";

// Home nativa — punto de entrada del tab "Inicio", mismo punto de decisión
// por rol que /[club]/dashboard en la web: solo resuelve los estados
// transversales (sin club / error de carga) y luego delega en la pantalla
// exclusiva del rol (OwnerDashboardScreen para OWNER/ADMIN,
// PlayerDashboardScreen para PLAYER — ver ese archivo). La identidad del
// club (logo/nombre/rol) ya vive en AppHeader, montado una sola vez sobre
// el tab navigator (RootNavigator.tsx) y visible en todas las pantallas —
// nunca repetida aquí.
export function HomeScreen() {
  const { signOut } = useAuth();
  const { club, role, loading: clubLoading, error: clubError, reload } = useClub();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (clubError) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{clubError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={reload}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!clubLoading && !club) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Sin club activo</Text>
          <Text style={styles.emptyText}>Tu cuenta no tiene una membresía activa en ningún club todavía.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.navigate("ChangeClub")}>
            <Text style={styles.retryButtonText}>Explorar clubes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (role === "OWNER" || role === "ADMIN") {
    return <OwnerDashboardScreen />;
  }

  return <PlayerDashboardScreen />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  errorText: { color: theme.colors.danger, fontSize: 14, textAlign: "center" },
  emptyTitle: { color: theme.colors.white, fontSize: 16, fontWeight: "700" },
  emptyText: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  retryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: 20, paddingVertical: 10 },
  retryButtonText: { color: theme.colors.bg, fontWeight: "700" },
  secondaryButton: { paddingHorizontal: 20, paddingVertical: 10 },
  secondaryButtonText: { color: theme.colors.muted, fontWeight: "600" },
});
