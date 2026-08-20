import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ReservationsListScreen } from "../screens/ReservationsListScreen";
import { theme } from "../lib/theme";

export type ReservationsStackParamList = {
  ReservationsList: undefined;
};

const Stack = createNativeStackNavigator<ReservationsStackParamList>();

// Stack nativo real (no un modal ni una vista condicional) — back nativo
// (gesto de borde en iOS, botón de sistema en Android) y transición
// push/pop nativa las trae createNativeStackNavigator sin configuración
// adicional.
//
// Solo contiene ReservationsList. ReservationDetail se movió al stack raíz
// (RootNavigator.tsx) — una reserva abierta desde Reservaciones, desde
// Notifications o desde una push ahora es siempre un push real sobre el
// MISMO historial (nunca params/state anidados artificiales), y el re-tap
// del tab "Reservaciones" nunca puede quedar "atascado" en un detalle,
// porque este stack ya no puede tener más de una ruta — el mecanismo
// tabPress/popToTop que existía acá para ese caso quedó sin función y se
// eliminó junto con el detalle.
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
      <Stack.Screen name="ReservationsList" component={ReservationsListScreen} options={{ headerShown: false, title: "Reservas" }} />
    </Stack.Navigator>
  );
}
