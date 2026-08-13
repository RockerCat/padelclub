import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ClubHomeScreen } from "../screens/ClubHomeScreen";
import { NewsDetailScreen } from "../screens/NewsDetailScreen";
import { theme } from "../lib/theme";
import type { ClubNewsCard } from "../../../shared/clubs/publicPageData";

export type ClubHomeStackParamList = {
  ClubHome: undefined;
  NewsDetail: { news: ClubNewsCard };
};

const Stack = createNativeStackNavigator<ClubHomeStackParamList>();

// Stack nativo real para "Página del club" (PLAYER) — mismo patrón que
// ReservationsStack/TournamentsStack: back nativo (gesto de borde en iOS,
// botón de sistema en Android) sin configuración adicional. `title: "Club"`
// en ClubHome alimenta el label del botón "atrás" de NewsDetail (headerShown
// es false en ClubHome, pero native-stack igual usa el `title` de la
// pantalla anterior para ese label por defecto) — mismo fix ya aplicado en
// ReservationsStack/TournamentsStack.
export function ClubHomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.white,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="ClubHome" component={ClubHomeScreen} options={{ headerShown: false, title: "Club" }} />
      <Stack.Screen name="NewsDetail" component={NewsDetailScreen} options={{ title: "" }} />
    </Stack.Navigator>
  );
}
