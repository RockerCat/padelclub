import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";

// Equivalente RN del Toast inferior usado en TournamentDetailView.tsx/
// EntriesSection.tsx/ClassificationSection.tsx (app web) tras cada
// mutación exitosa — mismo patrón: banner inferior, auto-descarta.
export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 2600);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 24, alignItems: "center", paddingHorizontal: 20 },
  toast: {
    backgroundColor: "#0e3347",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: theme.colors.white, fontSize: 13, fontWeight: "600", textAlign: "center" },
});
