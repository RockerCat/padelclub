import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
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

// "Crear cuenta" apunta al mismo destino que "Conocer más" — /auth/register
// no existe todavía porque el registro WEB necesita que el usuario elija
// primero jugador/propietario, selección que solo el landing resuelve hoy.
const REGISTER_URL = "https://mipadel.club/";
const SITE_URL = "https://mipadel.club/";

// Mismo flujo que LoginForm.tsx (app web): signInWithPassword contra las
// credenciales reales del usuario, mismos mensajes de error. "Crear cuenta"
// abre el registro real en la web (mismo patrón Linking.openURL que
// PublicClubScreen.tsx/ShareActions.tsx) — sigue sin haber registro nativo,
// esto es solo un link de salida. "Conocer más" es el mismo patrón, hacia
// el landing real (mipadel.club) — tampoco WebView ni deep link.
//
// El isotipo (mobile/assets/branding/logo-icon.png) es una copia exacta de
// assets/branding/logo-icon.png (repo root) — el mismo PNG que
// BrandLogo.tsx/Footer.tsx (app web) ya usan como icon. Se copia dentro de
// mobile/ porque metro.config.js solo resuelve projectRoot + shared/ (ver
// ese archivo) — assets/ de la raíz no es un watchFolder, así que un
// require() apuntando fuera de mobile/ no es bundleable. El wordmark
// "Mi"+"Padel"+"Club" se compone con texto con los mismos colores que
// BrandLogo.tsx, no con un PNG — ese es también el patrón real que WEB usa
// en cada superficie que muestra la marca completa (BrandLogo.tsx nunca
// usa un wordmark rasterizado; logo-primary.png/logo.png no están
// referenciados por ningún componente hoy).
//
// mobile/assets/background.png (cancha/pelotas/palas, ya con tratamiento
// oscuro) cubre TODA la pantalla vía ImageBackground como raíz — por fuera
// de SafeAreaView, así que también pinta detrás del status bar/notch, no
// solo el área de contenido. `overlay` es un tinte muy sutil
// (rgba, mismo tono que theme.colors.bg) solo para blindar el contraste del
// texto del header contra la franja de la imagen que `cover` deja visible
// en distintos alto/ancho de pantalla — nunca tan oscuro como para perder
// la cancha/pelotas/palas reconocibles.
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
    <ImageBackground source={require("../../assets/background.png")} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} pointerEvents="none" />
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <Image source={require("../../assets/branding/logo-icon.png")} style={styles.logoIcon} resizeMode="contain" />
              <Text style={styles.brand}>
                <Text style={{ color: theme.colors.primary }}>Mi</Text>
                <Text style={{ color: theme.colors.white }}>Padel</Text>
                <Text style={{ color: theme.colors.primary }}>Club</Text>
              </Text>
            </View>
            <View style={styles.heroTextGroup}>
              <Text style={styles.heroTitle}>Todo tu pádel en un solo lugar</Text>
              <Text style={styles.heroSubtitle}>Reserva canchas, participa en torneos y sigue el ranking de tu club.</Text>
              <TouchableOpacity onPress={() => Linking.openURL(SITE_URL)} hitSlop={8} style={styles.learnMoreButton}>
                <Text style={styles.learnMoreText}>Conocer más →</Text>
              </TouchableOpacity>
            </View>
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

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>¿Aún no tienes cuenta? </Text>
              <TouchableOpacity onPress={() => Linking.openURL(REGISTER_URL)} hitSlop={6}>
                <Text style={styles.registerLink}>Crear cuenta</Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,10,15,0.32)" },
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 28 },
  header: { alignItems: "center" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 28 },
  logoIcon: { width: 36, height: 36 },
  brand: { fontSize: 24, fontWeight: "800" },
  heroTextGroup: { alignItems: "center", gap: 6 },
  heroTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.white, textAlign: "center" },
  heroSubtitle: { fontSize: 13, color: theme.colors.muted, textAlign: "center", lineHeight: 19, paddingHorizontal: 8 },
  learnMoreButton: { marginTop: 4, paddingHorizontal: 10, paddingVertical: 4 },
  learnMoreText: { fontSize: 13, fontWeight: "700", color: theme.colors.primary },
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
  registerRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", marginTop: 4 },
  registerText: { color: theme.colors.muted, fontSize: 13 },
  registerLink: { color: theme.colors.primary, fontSize: 13, fontWeight: "700" },
});
