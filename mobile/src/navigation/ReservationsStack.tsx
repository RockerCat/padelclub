import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ReservationsListScreen } from "../screens/ReservationsListScreen";
import { ReservationDetailScreen } from "../screens/ReservationDetailScreen";
import { theme } from "../lib/theme";

export type ReservationsStackParamList = {
  ReservationsList: undefined;
  ReservationDetail: { id: string };
};

const Stack = createNativeStackNavigator<ReservationsStackParamList>();

// Stack nativo real (no un modal ni una vista condicional) — back nativo
// (gesto de borde en iOS, botón de sistema en Android) y transición
// push/pop nativa las trae createNativeStackNavigator sin configuración
// adicional.
export function ReservationsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.white,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {/* title: "Reservas" aquí no se ve (headerShown: false en esta
          pantalla) — pero native-stack usa el `title` de la pantalla
          ANTERIOR como label del botón "atrás" de la siguiente por
          defecto (headerBackTitle). Sin esto, el label caía al nombre
          de route interno "ReservationsList", nunca pensado como copy
          visible. Mismo fix ya aplicado en TournamentsStack.tsx. */}
      <Stack.Screen name="ReservationsList" component={ReservationsListScreen} options={{ headerShown: false, title: "Reservas" }} />
      {/* Sin título propio en el header nativo, igual que WEB (solo
          "← Reservas", sin un segundo texto de título junto al link de
          volver). El header nativo solo aporta la flecha "atrás" con el
          label heredado de arriba. */}
      <Stack.Screen name="ReservationDetail" component={ReservationDetailScreen} options={{ title: "" }} />
    </Stack.Navigator>
  );
}
