import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { TournamentsScreen } from "../screens/TournamentsScreen";
import { TournamentDetailScreen } from "../screens/TournamentDetailScreen";
import { theme } from "../lib/theme";

export type TournamentsStackParamList = {
  TournamentsList: undefined;
  TournamentDetail: { tournamentId: string };
};

const Stack = createNativeStackNavigator<TournamentsStackParamList>();

// Mismo patrón de stack nativo real que ReservationsStack.tsx — back
// nativo, transición push/pop nativa.
export function TournamentsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.white,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {/* title: "Torneos" aquí no se ve (headerShown: false en esta
          pantalla) — pero native-stack usa el `title` de la pantalla
          ANTERIOR como label del botón "atrás" de la siguiente por
          defecto (headerBackTitle). Sin esto, el label caía al nombre
          de route interno "TournamentsList", nunca pensado como copy
          visible. */}
      <Stack.Screen name="TournamentsList" component={TournamentsScreen} options={{ headerShown: false, title: "Torneos" }} />
      {/* Sin título propio en el header nativo — el header visible real
          de esta pantalla es el bloque custom dentro de
          TournamentDetailScreen (nombre del torneo, badges, etc.), igual
          que WEB. El header nativo solo aporta la flecha "atrás" con el
          label heredado de arriba ("Torneos"), replicando el "← Torneos"
          de WEB — nunca un segundo título encima. */}
      <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} options={{ title: "" }} />
    </Stack.Navigator>
  );
}
