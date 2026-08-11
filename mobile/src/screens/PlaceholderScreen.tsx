import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { theme } from "../lib/theme";

// Pantalla mínima para un tab del tabbar real (Jugadores/Torneos/Ranking/
// Club) todavía no implementado en la app nativa — el tab existe y es
// navegable (paridad visual con el tabbar de 6 items de la web) pero su
// contenido real es un módulo aparte, fuera de alcance de este slice.
export function PlaceholderScreen({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Icon width={28} height={28} color={theme.colors.muted} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Disponible próximamente en la app nativa.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: theme.colors.white, fontSize: 17, fontWeight: "700" },
  subtitle: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
});
