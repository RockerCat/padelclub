import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { ClubProvider, useClub } from "../contexts/ClubContext";
import { LoginScreen } from "../screens/LoginScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ChangeClubScreen } from "../screens/ChangeClubScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { AppTabs } from "./AppTabs";
import { AppHeader } from "../components/AppHeader";
import { theme } from "../lib/theme";

// Root del stack autenticado — "App" (AppShell), más dos pantallas
// account-level presentadas como modal nativo: "Profile" (equivalente de
// /profile, app web) y "ChangeClub" (equivalente de PLAYER/ADMIN tocando
// "Cambiar de club" → /clubs, app web). Ninguna de las dos vive dentro de
// un tab — son globales, sin club en su propio "param", igual que sus
// rutas WEB. RootStackParamList es el único tipo que las pantallas fuera de
// este árbol (AppHeader) necesitan para navegar aquí con seguridad de tipos.
export type RootStackParamList = {
  App: undefined;
  Profile: undefined;
  ChangeClub: undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.white,
    border: theme.colors.border,
    primary: theme.colors.primary,
  },
};

// AppHeader + AppTabs ahora viven DENTRO de una única Stack.Screen ("App")
// en vez de ser hermanos del propio Stack.Navigator — así AppHeader (el
// trigger del menú de usuario) es descendiente real del stack raíz y
// useNavigation() ahí resuelve contra RootStackParamList, no contra nada
// (antes, montado como hermano del Navigator, no tenía ningún contexto de
// navegación del que colgarse). El layout visual (header fijo arriba,
// contenido abajo) es exactamente el mismo que antes.
//
// `key={club?.id ?? "none"}` en AppTabs: fuerza a remontar TODO el árbol de
// tabs (y por lo tanto cada pantalla y su propio efecto de carga inicial)
// cada vez que cambia el club activo — ver ChangeClubScreen. Sin esto,
// cambiar de club dejaría cada pantalla ya montada mostrando datos del club
// anterior hasta su próximo refresh manual (el mismo tipo de bug de "dato
// cacheado del club equivocado" que CLAUDE.md ya documenta para otros
// módulos). Nunca afecta a OWNER/ADMIN hoy: ningún flujo existente cambia
// `club.id` para ellos todavía.
function AppShell() {
  const { club } = useClub();
  return (
    <View style={styles.appShell}>
      <AppHeader />
      <View style={styles.appContent}>
        <AppTabs key={club?.id ?? "none"} />
      </View>
    </View>
  );
}

// Único punto de decisión "a dónde entra el usuario" — equivalente nativo
// de resolveClubEntryPath/middleware en la web: sin sesión persistida
// (AsyncStorage, ver lib/supabase.ts) → Login; con sesión → tabs. Mientras
// supabase-js todavía está restaurando la sesión guardada (loading), un
// splash mínimo evita un parpadeo Login→Home al abrir la app con sesión
// válida.
export function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {session ? (
        <ClubProvider>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="App" component={AppShell} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="ChangeClub" component={ChangeClubScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: "modal" }} />
          </Stack.Navigator>
        </ClubProvider>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg },
  appShell: { flex: 1, backgroundColor: theme.colors.bg },
  appContent: { flex: 1 },
});
