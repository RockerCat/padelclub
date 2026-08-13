import { ActivityIndicator, StyleSheet, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, Users, CalendarDays, Swords, Trophy, Building2, createLucideIcon } from "lucide-react-native";
import { tennisBall, tennisRacket } from "@lucide/lab";
import { useClub } from "../contexts/ClubContext";
import { HomeScreen } from "../screens/HomeScreen";
import { PlayersScreen } from "../screens/PlayersScreen";
import { RankingScreen } from "../screens/RankingScreen";
import { PlaceholderScreen } from "../screens/PlaceholderScreen";
import { ReservationsStack } from "./ReservationsStack";
import { TournamentsStack } from "./TournamentsStack";
import { ClubHomeStack } from "./ClubHomeStack";
import { theme } from "../lib/theme";

export type OwnerAdminTabsParamList = {
  HomeTab: undefined;
  PlayersTab: undefined;
  ReservasTab: undefined;
  TournamentsTab: undefined;
  RankingTab: undefined;
  ClubTab: undefined;
};

export type PlayerTabsParamList = {
  HomeTab: undefined;
  ClubHomeTab: undefined;
  ReservasTab: undefined;
  RankingTab: undefined;
  TournamentsTab: undefined;
};

const OwnerAdminTab = createBottomTabNavigator<OwnerAdminTabsParamList>();
const PlayerTab = createBottomTabNavigator<PlayerTabsParamList>();

// "tennis-ball" no es un ícono core de lucide-react-native — vive en
// @lucide/lab (paquete oficial de Lucide, sin dependencias propias, mismo
// trazo/viewBox/stroke-width que el set principal ya usado por el resto de
// tabBarIcon en este archivo). createLucideIcon lo convierte en un
// componente con la misma forma que cualquier ícono core (acepta width/
// height/color, igual que LayoutDashboard/CalendarDays/etc. abajo).
// Reemplaza al intento anterior con Volleyball — visualmente no se leía
// como pelota de pádel/tenis.
const TennisBallIcon = createLucideIcon("tennis-ball", tennisBall);

// "tennis-racket" — mismo paquete, mismo trato. Reemplaza a Swords (dos
// espadas cruzadas, no una pala) SOLO en el tab "Torneos" del PLAYER más
// abajo — no existe ningún ícono "padel"/"paddle"/"table-tennis"/
// "ping-pong" en @lucide/lab ni en el set core de lucide-react-native;
// esta es la opción más cercana disponible (una sola raqueta/pala, nunca
// un par).
const TennisRacketIcon = createLucideIcon("tennis-racket", tennisRacket);

const commonScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: theme.colors.primary,
  tabBarInactiveTintColor: theme.colors.muted,
  tabBarStyle: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
  },
} as const;

// Traducción 1:1 del tabbar mobile de AppNav.tsx (app web, rama OWNER/
// ADMIN — 6 items fijos): Inicio/Jugadores/Reservas/Torneos/Ranking/Club,
// mismo orden, mismos íconos lucide (LayoutDashboard/Users/CalendarDays/
// Swords/Trophy/Building2) y mismas etiquetas abreviadas ("Inicio" en vez
// de "Dashboard", "Reservas" en vez de "Reservaciones" — igual que
// OWNER_ADMIN_TAB_BAR_LABEL_OVERRIDES en la web). Ranking/Club siguen en
// PlaceholderScreen — módulos aparte, no implementados todavía en la app
// nativa. Sin cambios respecto a la versión anterior de este archivo.
function OwnerAdminTabs() {
  return (
    <OwnerAdminTab.Navigator screenOptions={commonScreenOptions}>
      <OwnerAdminTab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: "Inicio", tabBarIcon: ({ color, size }) => <LayoutDashboard width={size} height={size} color={color} /> }}
      />
      <OwnerAdminTab.Screen
        name="PlayersTab"
        component={PlayersScreen}
        options={{ title: "Jugadores", tabBarIcon: ({ color, size }) => <Users width={size} height={size} color={color} /> }}
      />
      <OwnerAdminTab.Screen
        name="ReservasTab"
        component={ReservationsStack}
        options={{ title: "Reservas", tabBarIcon: ({ color, size }) => <CalendarDays width={size} height={size} color={color} /> }}
      />
      <OwnerAdminTab.Screen
        name="TournamentsTab"
        component={TournamentsStack}
        options={{ title: "Torneos", tabBarIcon: ({ color, size }) => <Swords width={size} height={size} color={color} /> }}
      />
      <OwnerAdminTab.Screen
        name="RankingTab"
        options={{ title: "Ranking", tabBarIcon: ({ color, size }) => <Trophy width={size} height={size} color={color} /> }}
      >
        {() => <PlaceholderScreen title="Ranking" icon={Trophy} />}
      </OwnerAdminTab.Screen>
      <OwnerAdminTab.Screen
        name="ClubTab"
        options={{ title: "Club", tabBarIcon: ({ color, size }) => <Building2 width={size} height={size} color={color} /> }}
      >
        {() => <PlaceholderScreen title="Club" icon={Building2} />}
      </OwnerAdminTab.Screen>
    </OwnerAdminTab.Navigator>
  );
}

// Tabbar del PLAYER — paridad exacta con PLAYER_TAB_BAR_LABELS en
// AppNav.tsx (app web): Dashboard | Página del club | Reservaciones |
// Ranking | Torneos, en ese orden, con etiquetas completas (a diferencia
// de OWNER/ADMIN, el PLAYER nunca abrevia "Dashboard"→"Inicio" ni
// "Reservaciones"→"Reservas" — la web tampoco lo hace para este rol).
//
// "Jugadores" NO aparece aquí — nunca apareció en la navegación PLAYER de
// la web (getNavItems solo lo agrega para OWNER/ADMIN, apuntando a
// /admin/players). El PlayersTab que antes se compartía con OWNER/ADMIN
// era en realidad ese mismo listado administrativo (ver PlayersScreen.tsx
// — puerto 1:1 de /admin/players/MembersClient.tsx) montado sin ningún
// guard de rol: un PLAYER podía ver el estado activo/inactivo, categoría,
// puntos y número de WhatsApp de cualquier otro miembro del club — una
// violación real de Player Contact Principles/Privacy Principles en
// CLAUDE.md. Quitar este tab para PLAYER no es "ocultar temporalmente"
// una función, es remover un acceso que nunca debió existir; no hay
// ningún subflujo dentro de "Página del club" (o en ningún otro lugar de
// la web) que exponga esta pantalla al PLAYER, así que no hay nada que
// reubicar.
//
// "Página del club" (ClubHomeTab) es el equivalente nativo real de
// /[club]/home (app web) — ver ClubHomeScreen.tsx para el detalle exacto
// de qué se portó y qué se dejó fuera de esta pasada (mapa interactivo,
// lightbox de galería). Su label ya NO es un texto fijo — es club.name
// (mismo dato ya cargado por ClubContext, ninguna query nueva), igual que
// AppNav.tsx (app web) para este mismo item. `title` (string) alimenta el
// label por defecto de bottom-tabs (Label.js, @react-navigation/elements),
// que ya trunca a 1 línea con ellipsis y respeta el mismo ancho fijo por
// tab que el resto — no hace falta un tabBarLabel custom para lograrlo. El
// ícono cambió de casa (Home) a pelota de tenis/pádel (TennisBallIcon, ver
// arriba — @lucide/lab, no un ícono core) — misma familia visual de
// íconos, mismo stroke/peso, mismo tratamiento active/inactive que
// cualquier otro tab (heredado de tabBarActiveTintColor/
// tabBarInactiveTintColor en commonScreenOptions, sin cambios).
//
// ReservasTab/TournamentsTab conservan los mismos route keys que ya usaba
// el tabbar compartido anterior — todo navigation.navigate("ReservasTab",
// ...)/navigation.navigate("TournamentsTab", ...) ya existente (Dashboard
// PLAYER, notificaciones, etc.) sigue funcionando sin cambios.
function PlayerTabs() {
  const { club } = useClub();
  const clubHomeLabel = club?.name ?? "Mi club";

  return (
    <PlayerTab.Navigator screenOptions={commonScreenOptions}>
      <PlayerTab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <LayoutDashboard width={size} height={size} color={color} /> }}
      />
      <PlayerTab.Screen
        name="ClubHomeTab"
        component={ClubHomeStack}
        options={{ title: clubHomeLabel, tabBarIcon: ({ color, size }) => <TennisBallIcon width={size} height={size} color={color} /> }}
      />
      <PlayerTab.Screen
        name="ReservasTab"
        component={ReservationsStack}
        options={{ title: "Reservaciones", tabBarIcon: ({ color, size }) => <CalendarDays width={size} height={size} color={color} /> }}
      />
      {/* RankingTab del PLAYER deja de ser PlaceholderScreen — RankingScreen
          es el equivalente nativo real de RankingView.tsx (app web), ver
          RankingScreen.tsx. OwnerAdminTabs arriba sigue con
          PlaceholderScreen sin cambios: este módulo es PLAYER-only por
          ahora. */}
      <PlayerTab.Screen
        name="RankingTab"
        component={RankingScreen}
        options={{ title: "Ranking", tabBarIcon: ({ color, size }) => <Trophy width={size} height={size} color={color} /> }}
      />
      <PlayerTab.Screen
        name="TournamentsTab"
        component={TournamentsStack}
        options={{ title: "Torneos", tabBarIcon: ({ color, size }) => <TennisRacketIcon width={size} height={size} color={color} /> }}
      />
    </PlayerTab.Navigator>
  );
}

// Punto de decisión "qué tabbar mostrar" — nuevo en este cambio (antes
// había un único AppTabs sin ramificar por rol, ver comentario en
// PlayerTabs arriba). Mientras ClubContext todavía está resolviendo la
// membresía activa (loading === true, ver ClubContext.tsx), se mantiene un
// splash mínimo en vez de decidir con role === null todavía — evita que un
// OWNER/ADMIN vea un parpadeo del tabbar PLAYER (o viceversa) mientras el
// rol real sigue cargando. Con loading resuelto, cualquier valor de role
// que no sea exactamente "PLAYER" (incluido null — sin club activo) cae en
// OwnerAdminTabs, el mismo comportamiento de fallback que ya existía de
// hecho antes de este cambio (un único tabbar para todos).
export function AppTabs() {
  const { role, loading } = useClub();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return role === "PLAYER" ? <PlayerTabs /> : <OwnerAdminTabs />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg },
});
