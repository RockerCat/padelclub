import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { theme } from "../lib/theme";

// Mismo flujo que LoginForm.tsx (app web): signInWithPassword contra las
// credenciales reales del usuario, mismos mensajes de error. No hay "Crear
// cuenta" aquí — este vertical slice valida la experiencia nativa de un
// jugador que ya tiene cuenta en Mi Pádel Club, el registro sigue siendo
// un flujo web (RegisterMenu) fuera de alcance de esta fase.
export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>
              Mi Pádel <Text style={{ color: theme.colors.primary }}>Club</Text>
            </Text>
            <Text style={styles.subtitle}>Accede a tu club</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesión</Text>

            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />

            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
            />

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading || !email || !password}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.buttonText}>Entrar</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 32 },
  header: { alignItems: "center", gap: 6 },
  brand: { fontSize: 26, fontWeight: "800", color: theme.colors.white },
  subtitle: { fontSize: 14, color: theme.colors.muted },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.white, marginBottom: 4 },
  label: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
  input: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.white,
    fontSize: 15,
  },
  errorBox: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderColor: "rgba(248,113,113,0.2)",
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  errorText: { color: theme.colors.danger, fontSize: 13 },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.bg, fontWeight: "700", fontSize: 15 },
});
