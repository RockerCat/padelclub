import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./RootNavigator";
import { navigateIntoApp } from "./navigateIntoApp";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useClub } from "../contexts/ClubContext";
import { resolveNotificationTarget, buildTabNav } from "../lib/notificationNav";
import { markNotificationRead } from "../lib/notificationActions";
import { updateLastClub } from "../lib/clubSwitcher";
import type { NotificationRow } from "../lib/notifications";

// Cubre "tap-to-open" de una push real (expo-notifications), reusando
// EXACTAMENTE el mismo flujo que NotificationsScreen.handleItemPress:
// resolveNotificationTarget → (change_club | mismo club | cross-club vía
// pendingNav/pendingRootNav) → buildTabNav → navigateIntoApp. Nunca una
// segunda copia de esas reglas — solo el punto de entrada cambia (una push
// tap en vez de un tap en la lista).
//
// Montado DENTRO de ClubProvider (ver RootNavigator.tsx) porque necesita
// useAuth()/useClub() reales, no un stub — eso también resuelve el
// requisito "no descartar un cold-start sin sesión": mientras la sesión no
// está lista, RootNavigator ni siquiera monta este componente (splash
// primero, login stack si no hay sesión), así que
// getLastNotificationResponseAsync() solo se consulta una vez que ya hay
// userId. El ref `pendingWithoutAuth` es una segunda red de seguridad para
// el caso límite en que este componente ya esté montado pero `userId`
// todavía no resolvió (session existe pero el bootstrap del context no
// terminó su primer render) — no descarta el id, lo reintenta apenas
// `userId` cambia a no-nulo.
//
// Fallback de AppState: confirmado en iOS que
// addNotificationResponseReceivedListener puede NO disparar cuando el tap
// sobre la push reactiva la app desde background (el proceso ya estaba
// vivo, iOS solo lo trae a foreground) — el listener está pensado para
// cuando expo-notifications entrega el evento de forma nativa, pero eso no
// siempre ocurre en ese escenario exacto. AppState.addEventListener("change")
// a "active" vuelve a consultar getLastNotificationResponseAsync() como red
// de seguridad — misma respuesta cacheada que el cold start ya usa, mismo
// procesamiento (processResponse), mismo dedup (processedIds) — nunca una
// segunda copia de la lógica de extracción/apertura.
export function PushNotificationNavigator() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const { club: currentClub, loading: clubLoading, reload: reloadClub, setPendingNav, pendingRootNav, setPendingRootNav } = useClub();
  const userId = session?.user.id ?? null;

  // Dedup por notification_id dentro de esta misma ejecución — listener,
  // cold start y el fallback de AppState pueden disparar para la misma
  // respuesta (confirmado en Android para listener+cold start; el mismo
  // notification_id es la única protección real, ver punto 7 de la tarea:
  // getLastNotificationResponseAsync() sigue devolviendo la última
  // respuesta cacheada cada vez que se consulta, así que sin este set se
  // reabriría la misma notificación histórica cada vez que la app vuelve a
  // foreground). Sin estado/UI.
  const processedIds = useRef<Set<string>>(new Set());
  const pendingWithoutAuth = useRef<string | null>(null);

  // openFromNotificationId es invocada desde callbacks registrados una sola
  // vez (deps [] más abajo) — currentClub leído directo por closure quedaría
  // congelado en el valor del primer render (casi siempre null, ClubContext
  // todavía cargando). Este ref mantiene la lectura viva sin re-suscribir
  // el listener de expo-notifications.
  const currentClubRef = useRef(currentClub);
  useEffect(() => {
    currentClubRef.current = currentClub;
  }, [currentClub]);

  async function openFromNotificationId(notificationId: string) {
    if (!userId || clubLoading) {
      pendingWithoutAuth.current = notificationId;
      return;
    }
    if (processedIds.current.has(notificationId)) return;
    processedIds.current.add(notificationId);

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, club_id, type, title, message, metadata, read_at, resolved_status, resolved_at, created_at, clubs(slug, name)")
        .eq("id", notificationId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (error || !data) return;
      const notification = data as unknown as NotificationRow;

      markNotificationRead(supabase, userId, notification.id);

      const target = resolveNotificationTarget(notification);
      if (target.kind === "none") return;

      if (target.kind === "change_club") {
        navigation.navigate("ChangeClub");
        return;
      }

      // Mismo flujo que NotificationsScreen.handleItemPress: cross-club deja
      // la navegación pendiente en ClubContext y fuerza un cambio de club
      // activo antes de navegar; mismo club navega directo.
      const crossClub = !!notification.club_id && notification.club_id !== currentClubRef.current?.id;

      // ReservationDetail vive en el stack raíz (RootNavigator.tsx) — push
      // directo sobre navigation, igual que NotificationsScreen.tsx. Nunca
      // pasa por buildTabNav/setPendingNav para este target.
      if (target.kind === "reservation_detail") {
        if (crossClub && notification.club_id) {
          // Cross-club: NO navegar acá. AppTabs se remonta cuando cambia
          // club.id (key={club?.id} en AppShell) — un navigate() inmediato
          // después de este await corre en carrera contra ese remonte y
          // puede perderse. setPendingRootNav lo deja para el useEffect de
          // abajo, que solo navega una vez clubLoading vuelve a false —
          // después del commit real del club nuevo.
          setPendingRootNav({ screen: "ReservationDetail", params: { id: target.reservationId } });
          try {
            await updateLastClub(supabase, userId, notification.club_id);
          } catch {
            // Best-effort, igual que NotificationsScreen — nunca bloquea seguir.
          }
          await reloadClub();
          return;
        }
        navigation.navigate("ReservationDetail", { id: target.reservationId });
        return;
      }

      if (crossClub && notification.club_id) {
        const navSpec = await buildTabNav(supabase, target, notification.club_id);
        if (navSpec) setPendingNav(navSpec);
        try {
          await updateLastClub(supabase, userId, notification.club_id);
        } catch {
          // Best-effort, igual que NotificationsScreen — nunca bloquea seguir.
        }
        await reloadClub();
        navigateIntoApp(navigation);
        return;
      }

      if (!currentClubRef.current) return;
      const navSpec = await buildTabNav(supabase, target, currentClubRef.current.id);
      if (navSpec) setPendingNav(navSpec);
      navigateIntoApp(navigation);
    } catch {
      // Defensivo: un fallo de lookup/navegación nunca debe tumbar la app
      // ni mostrar un alert nuevo.
    }
  }

  function extractNotificationId(data: { [key: string]: unknown } | null | undefined): string | null {
    const value = data?.notification_id;
    return typeof value === "string" ? value : null;
  }

  // Punto único de extracción + apertura — listener, cold start y el
  // fallback de AppState llaman exactamente esta misma función, nunca una
  // copia paralela.
  function processResponse(response: Notifications.NotificationResponse): void {
    const notificationId = extractNotificationId(response.notification.request.content.data);
    if (notificationId) openFromNotificationId(notificationId);
  }

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      processResponse(response);
    });

    // Cold start: la app estaba cerrada y el tap sobre la push la abrió.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) processResponse(response);
    });

    // Fallback: la app ya estaba viva (background) y el tap solo la
    // reactivó — addNotificationResponseReceivedListener puede no disparar
    // en ese caso (ver comentario arriba). Se re-consulta la misma
    // respuesta cacheada cada vez que la app vuelve a "active"; processedIds
    // en openFromNotificationId es lo que evita reabrir una respuesta ya
    // procesada (o histórica) en cada regreso a foreground.
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) processResponse(response);
      });
    });

    return () => {
      subscription.remove();
      appStateSubscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (userId && !clubLoading && pendingWithoutAuth.current) {
      const notificationId = pendingWithoutAuth.current;
      pendingWithoutAuth.current = null;
      openFromNotificationId(notificationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, clubLoading]);

  // Consumidor único de pendingRootNav — PushNotificationNavigator nunca se
  // remonta al cambiar de club (a diferencia de AppTabs/PlayerTabs), así que
  // es el lugar seguro para reaccionar recién cuando clubLoading vuelve a
  // false: React ya comprometió el render con el club nuevo en ese punto.
  // Sirve tanto al flujo de push (arriba) como al de NotificationsScreen.tsx
  // (mismo ClubContext, mismo pendingRootNav, sin duplicar este consumer).
  useEffect(() => {
    if (!pendingRootNav || clubLoading) return;
    const nav = pendingRootNav;
    setPendingRootNav(null);
    navigation.navigate(nav.screen, nav.params);
  }, [pendingRootNav, clubLoading, navigation, setPendingRootNav]);

  return null;
}
