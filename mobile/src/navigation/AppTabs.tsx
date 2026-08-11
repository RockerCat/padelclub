import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, Users, CalendarDays, Swords, Trophy, Building2 } from "lucide-react-native";
import { HomeScreen } from "../screens/HomeScreen";
import { PlayersScreen } from "../screens/PlayersScreen";
import { PlaceholderScreen } from "../screens/PlaceholderScreen";
import { ReservationsStack } from "./ReservationsStack";
import { TournamentsStack } from "./TournamentsStack";
import { theme } from "../lib/theme";

export type AppTabsParamList = {
  HomeTab: undefined;
  PlayersTab: undefined;
  ReservasTab: undefined;
  TournamentsTab: undefined;
  RankingTab: undefined;
  ClubTab: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

// Traducción 1:1 del tabbar mobile de AppNav.tsx (app web, rama OWNER/
// ADMIN — 6 items fijos): Inicio/Jugadores/Reservas/Torneos/Ranking/Club,
// mismo orden, mismos íconos lucide (LayoutDashboard/Users/CalendarDays/
// Swords/Trophy/Building2) y mismas etiquetas abreviadas ("Inicio" en vez
// de "Dashboard", "Reservas" en vez de "Reservaciones" — igual que
// OWNER_ADMIN_TAB_BAR_LABEL_OVERRIDES en la web). Ranking/Club siguen en
// PlaceholderScreen — módulos aparte, no implementados todavía en la app
// nativa.
export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: "Inicio", tabBarIcon: ({ color, size }) => <LayoutDashboard width={size} height={size} color={color} /> }}
      />
      <Tab.Screen
        name="PlayersTab"
        component={PlayersScreen}
        options={{ title: "Jugadores", tabBarIcon: ({ color, size }) => <Users width={size} height={size} color={color} /> }}
      />
      <Tab.Screen
        name="ReservasTab"
        component={ReservationsStack}
        options={{ title: "Reservas", tabBarIcon: ({ color, size }) => <CalendarDays width={size} height={size} color={color} /> }}
      />
      <Tab.Screen
        name="TournamentsTab"
        component={TournamentsStack}
        options={{ title: "Torneos", tabBarIcon: ({ color, size }) => <Swords width={size} height={size} color={color} /> }}
      />
      <Tab.Screen
        name="RankingTab"
        options={{ title: "Ranking", tabBarIcon: ({ color, size }) => <Trophy width={size} height={size} color={color} /> }}
      >
        {() => <PlaceholderScreen title="Ranking" icon={Trophy} />}
      </Tab.Screen>
      <Tab.Screen
        name="ClubTab"
        options={{ title: "Club", tabBarIcon: ({ color, size }) => <Building2 width={size} height={size} color={color} /> }}
      >
        {() => <PlaceholderScreen title="Club" icon={Building2} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
