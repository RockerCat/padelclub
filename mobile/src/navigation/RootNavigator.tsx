import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { ClubProvider } from "../contexts/ClubContext";
import { LoginScreen } from "../screens/LoginScreen";
import { AppTabs } from "./AppTabs";
import { AppHeader } from "../components/AppHeader";
import { theme } from "../lib/theme";

const Stack = createNativeStackNavigator();

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
          <View style={styles.appShell}>
            <AppHeader />
            <View style={styles.appContent}>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="App" component={AppTabs} />
              </Stack.Navigator>
            </View>
          </View>
        </ClubProvider>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg },
  appShell: { flex: 1, backgroundColor: theme.colors.bg },
  appContent: { flex: 1 },
});
