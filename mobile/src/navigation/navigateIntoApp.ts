import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./RootNavigator";

// "App" is typed `undefined` in RootStackParamList — its nested tab
// navigator is PlayerTabs or OwnerAdminTabs depending on a role only known
// at runtime, and React Navigation has no clean way to express a
// conditional/union nested ParamList tied to that. This is the one, single
// contained escape hatch for navigating into "App"'s nested tab/screen —
// used by AppTabs.tsx (consuming ClubContext.pendingNav after a cross-club
// switch) and NotificationsScreen.tsx (same-club direct navigation) — never
// scattered `as any` casts per call site.
export function navigateIntoApp(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  target?: { screen: string; params?: { screen?: string; params?: Record<string, unknown> } }
): void {
  (navigation.navigate as (...args: unknown[]) => void)("App", target);
}
