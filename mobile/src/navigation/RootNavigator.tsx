import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { ClubProvider, useClub } from "../contexts/ClubContext";
import { LoginScreen } from "../screens/LoginScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ChangeClubScreen } from "../screens/ChangeClubScreen";
import { PublicClubScreen } from "../screens/PublicClubScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ReservationDetailScreen } from "../screens/ReservationDetailScreen";
import { OwnerAdminWebScreen } from "../screens/OwnerAdminWebScreen";
import type { ClubDirectoryEntry } from "../lib/clubSwitcher";
import { AppTabs } from "./AppTabs";
import { AppHeader } from "../components/AppHeader";
import { supabase } from "../lib/supabase";
import { registerPushToken } from "../lib/pushNotifications";
import { PushNotificationNavigator } from "./PushNotificationNavigator";
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
  // Página pública de un club — alcanzada desde ChangeClub al tocar una
  // fila que no es la propia membresía activa (ver ese archivo). `entry` es
  // el mismo ClubDirectoryEntry que ChangeClub ya cargó (evita repetir esa
  // query aquí); relationKind/relationRole es el mismo relationOf(clubId)
  // que ChangeClub ya calculó, así esta pantalla no vuelve a leer
  // memberships/pending por su cuenta. Vive en MainStack y en NoClubStack
  // (un usuario sin club también debe poder llegar aquí desde "Explorar
  // clubes") — nunca solo en uno de los dos.
  PublicClub: { entry: ClubDirectoryEntry; relationKind: "member" | "pending" | "none"; relationRole?: string };
  Notifications: undefined;
  // Screen de nivel raíz (no vive dentro de ReservationsStack/ReservasTab) —
  // así una reserva abierta desde Notifications, push o Reservaciones queda
  // en el MISMO historial real del stack raíz: back siempre cierra
  // exactamente esta pantalla y revela lo que estaba debajo (Notifications,
  // "App" con Reservaciones, o lo que corresponda), sin params/state
  // anidados artificiales y sin tab bar (una screen del stack raíz cubre
  // toda la pantalla, tapando el tab bar de "App" que sigue montado debajo).
  ReservationDetail: { id: string };
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

// Stack normal (con club activo) — "App" (tabs) es la ruta inicial, el
// resto de screens globales encima como siempre.
function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="App" component={AppShell} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ presentation: "modal" }} />
      <Stack.Screen name="ChangeClub" component={ChangeClubScreen} options={{ presentation: "modal" }} />
      <Stack.Screen name="PublicClub" component={PublicClubScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: "modal" }} />
      {/* headerShown/headerStyle explícitos porque el Navigator por
          defecto oculta el header (screenOptions arriba) — esta screen sí
          necesita el header nativo real para su propio headerLeft (ver
          ReservationDetailScreen.tsx), mismos colores que ya usaba dentro
          de ReservationsStack.tsx. */}
      <Stack.Screen
        name="ReservationDetail"
        component={ReservationDetailScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.bg },
          title: "",
        }}
      />
    </Stack.Navigator>
  );
}

// Stack para OWNER/ADMIN con club activo — V1 mobile no tiene dashboards ni
// pantallas operativas para estos roles (ver CLAUDE.md, objetivo de este
// cambio): en vez de "App" (AppShell con AppTabs) se monta directamente
// OwnerAdminWebScreen, sin tab bar ni AppHeader ("navbar administrativa").
// Reutiliza el mismo key "App" de RootStackParamList (evita agregar un tipo
// nuevo solo para esto) y registra "ChangeClub" como screen propia —
// ChangeClubScreen es genérica por rol (no filtra a PLAYER, ver ese
// archivo), así que un OWNER con más de un club puede seguir cambiando de
// club activo sin ninguna lógica nueva.
function OwnerAdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="App" component={OwnerAdminWebScreen} />
      <Stack.Screen name="ChangeClub" component={ChangeClubScreen} options={{ presentation: "modal" }} />
    </Stack.Navigator>
  );
}

// Stack para un usuario autenticado SIN ninguna membresía activa —
// ChangeClub es la ÚNICA ruta, así que queda como pantalla raíz (sin
// presentation: "modal", sin tab bar, porque "App"/AppTabs ni siquiera
// está montado en este árbol). Nunca "App" con AppTabs mostrando un
// club vacío: eso dejaba tabs como Reservas/Torneos operando sobre nada.
function NoClubStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChangeClub" component={ChangeClubScreen} />
      <Stack.Screen name="PublicClub" component={PublicClubScreen} />
    </Stack.Navigator>
  );
}

// Decide estructuralmente cuál de los dos stacks montar — nunca un
// navigate() imperativo para esto, así que no hay riesgo de loop ni de
// re-disparar navegación en cada render. Cuando `club` pasa de null a un
// club real (por ejemplo, justo después de unirse desde ChangeClubScreen
// dentro de NoClubStack), este componente cambia qué componente devuelve
// (NoClubStack → MainStack) — React desmonta el primero y monta el
// segundo desde cero, aterrizando en "App" (su primera screen) sin
// necesidad de que ChangeClubScreen sepa nada de este árbol ni tenga que
// navegar manualmente a ningún lado. La transición inversa (un club se
// vuelve inaccesible) es simétrica por el mismo mecanismo, aunque hoy no
// hay ningún flujo que la dispare.
function AuthenticatedNavigator() {
  const { club, role, loading: clubLoading } = useClub();

  if (clubLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  if (!club) return <NoClubStack />;
  // Depende del rol en el CLUB ACTIVO, nunca de si el usuario tiene alguna
  // membresía OWNER/ADMIN en otro club — `role` ya es exactamente el rol de
  // `club` (ver ClubContext.tsx → resolveActiveMembership), así que un
  // OWNER de otro club que hoy tiene activo un club donde es PLAYER cae en
  // MainStack normal, no aquí.
  if (role === "OWNER" || role === "ADMIN") return <OwnerAdminStack />;
  return <MainStack />;
}

// Único punto de decisión "a dónde entra el usuario" — equivalente nativo
// de resolveClubEntryPath/middleware en la web: sin sesión persistida
// (AsyncStorage, ver lib/supabase.ts) → Login; con sesión → tabs. Mientras
// supabase-js todavía está restaurando la sesión guardada (loading), un
// splash mínimo evita un parpadeo Login→Home al abrir la app con sesión
// válida.
export function RootNavigator() {
  const { session, loading } = useAuth();

  // Único call site de registro de push token — Fase 1 (solo
  // infraestructura, ver mobile/src/lib/pushNotifications.ts). Corre una
  // vez por sesión iniciada, nunca por pantalla individual, para que nunca
  // haya dos intentos de registro compitiendo. registerPushToken nunca
  // lanza (permiso denegado, sin projectId, sin red, error de upsert —
  // todo se traga internamente), así que esto nunca puede bloquear el
  // arranque ni el login.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    registerPushToken(supabase, userId);
  }, [userId]);

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
          <AuthenticatedNavigator />
          <PushNotificationNavigator />
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
