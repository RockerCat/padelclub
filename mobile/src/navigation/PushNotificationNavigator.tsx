import { useEffect, useRef, useState } from "react";
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
  const {
    club: currentClub,
    loading: clubLoading,
    reloading,
    reload: reloadClub,
    setPendingNav,
    pendingRootNav,
    setPendingRootNav,
  } = useClub();
  const userId = session?.user.id ?? null;

  // Verdadero justo después de un reloadClub() que puede haber transicionado
  // NoClubStack → MainStack (primer club) — el useEffect de abajo solo
  // navega a "App" una vez `reloading` vuelve a false, es decir, una vez
  // React ya comprometió el render con el club nuevo (y por lo tanto, si
  // aplica, ya montó MainStack) — nunca inmediatamente después del `await`,
  // que es exactamente la carrera que rompía este flujo (ver
  // PushNotificationNavigator/NotificationsScreen — antes navegaba justo
  // tras el await, sin esperar el commit real).
  const [awaitingClubEntry, setAwaitingClubEntry] = useState(false);

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
    if (processedIds.current.has(notificationId)) {
      return;
    }
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
        // Revalida ClubContext ANTES de navegar — este target cubre tanto
        // "sin club todavía" como player_deactivated (metadata.destination
        // = "/clubs"): en ambos casos el club/rol que ClubContext tiene en
        // memoria puede haber quedado obsoleto (p. ej. el club recién
        // desactivado sigue siendo "currentClub" hasta este await). Sin
        // esto, ChangeClubScreen ya revalida su propio estado local
        // (memberships/pending) pero AppHeader, AuthenticatedNavigator y el
        // badge "Actual" seguían leyendo la membresía vieja hasta el
        // próximo trigger de reload — Supabase debe ser la fuente de
        // verdad también para este target, igual que los demás de abajo.
        await reloadClub();
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
          // abajo, que solo navega una vez `reloading` vuelve a false —
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
        // NO navegar aquí todavía — mismo tipo de carrera que ya documenta
        // el bloque de reservation_detail arriba: un navigate() inmediato
        // después de este await puede perder contra el remonte estructural
        // que AuthenticatedNavigator dispara al ver `club` no-nulo
        // (NoClubStack → MainStack, ver RootNavigator.tsx) — "App" ni
        // siquiera existe todavía como ruta en NoClubStack en ese instante.
        // setAwaitingClubEntry deja la navegación para el useEffect de abajo,
        // que solo dispara una vez `reloading` vuelve a false — es decir,
        // una vez React ya comprometió el render con el club nuevo (y si
        // aplica, ya montó MainStack) — nunca antes.
        setAwaitingClubEntry(true);
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
    const result = typeof value === "string" ? value : null;
    return result;
  }

  // Punto único de extracción + apertura — listener, cold start y el
  // fallback de AppState llaman exactamente esta misma función, nunca una
  // copia paralela.
  //
  // getLastNotificationResponseAsync() (usado por el cold-start check y el
  // fallback de AppState, ver abajo) NO es "dame lo que cambió desde la
  // última consulta" — es un getter de un único slot nativo persistente
  // ("la respuesta más reciente"), que sigue devolviendo LA MISMA respuesta
  // en cada llamada hasta que se limpia explícitamente (ver
  // clearLastNotificationResponse más abajo — documentado así por Expo:
  // "it is undesirable to continue selecting the route after the response
  // has already been handled"). Sin limpiarlo, cada vuelta a foreground
  // (por CUALQUIER motivo, no solo tocar una push) volvía a entregar la
  // MISMA respuesta ya procesada — confirmado en runtime: una aprobación ya
  // consumida seguía devolviéndose en cada `AppState → active`, eclipsando
  // cualquier push nueva (p. ej. player_deactivated) que debiera ocupar ese
  // mismo slot. `clearLastNotificationResponse()` se llama aquí, en el
  // punto único de entrada, ANTES de decidir nada más — así el slot nativo
  // queda vacío apenas se observa cualquier respuesta (llegue por el
  // listener en vivo, por cold start o por el fallback de AppState),
  // independientemente de si processedIds la dedup más abajo o de si
  // termina siendo accionable. `processedIds` (en memoria, se pierde en
  // cada reload de Metro o relanzamiento de la app) sigue existiendo como
  // segunda red de seguridad para el caso de listener+cold start
  // disparando para la MISMA respuesta dentro de la MISMA sesión — pero ya
  // no es la única defensa contra que una respuesta vieja vuelva a
  // navegar tras un reload/relanzamiento, que es exactamente lo que
  // clearLastNotificationResponse() ahora garantiza a nivel nativo.
  function processResponse(response: Notifications.NotificationResponse): void {
    Notifications.clearLastNotificationResponse();
    const notificationId = extractNotificationId(response.notification.request.content.data);
    if (notificationId) {
      openFromNotificationId(notificationId);
    }
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
  // es el lugar seguro para reaccionar recién cuando `reloading` vuelve a
  // false: React ya comprometió el render con el club nuevo en ese punto.
  // Sirve tanto al flujo de push (arriba) como al de NotificationsScreen.tsx
  // (mismo ClubContext, mismo pendingRootNav, sin duplicar este consumer).
  //
  // Antes esta guarda usaba `clubLoading` — dejó de servir para esto desde
  // que hasLoadedOnceRef (ver ClubContext.tsx) hace que `loading` ya NO se
  // ponga en true durante un reload en segundo plano: `clubLoading` queda
  // permanentemente en false post-bootstrap, así que la condición `!
  // pendingRootNav || clubLoading` dejaba de esperar nada — el efecto
  // disparaba en cuanto se seteaba pendingRootNav, ANTES de que
  // reloadClub() siquiera terminara. `reloading` (nuevo campo en
  // ClubContext, separado de `loading` a propósito) sí sigue alternando
  // true/false en cada reload, con o sin bootstrap de por medio — restaura
  // la espera real sin reintroducir el splash global.
  useEffect(() => {
    if (!pendingRootNav || reloading) return;
    const nav = pendingRootNav;
    setPendingRootNav(null);
    navigation.navigate(nav.screen, nav.params);
  }, [pendingRootNav, reloading, navigation, setPendingRootNav]);

  // Consumidor de awaitingClubEntry (ver arriba) — misma razón/mismo patrón
  // que el efecto de pendingRootNav: esperar a que `reloading` se asiente
  // antes de navegar a "App", nunca justo después del `await reloadClub()`
  // síncrono (esa inmediatez es la carrera real, ver comentario donde se
  // llama setAwaitingClubEntry). pendingNav (el destino de tab real) ya fue
  // seteado antes del reload y lo consume PlayerTabs en su propio efecto de
  // montaje — este navigate() solo necesita aterrizar en "App", que ya es
  // una ruta válida en el navigator que esté montado en este punto
  // (MainStack, sea porque ya estaba o porque el reload recién lo montó).
  useEffect(() => {
    if (!awaitingClubEntry) {
      return;
    }
    if (reloading) {
      return;
    }
    setAwaitingClubEntry(false);
    navigateIntoApp(navigation);
  }, [awaitingClubEntry, reloading, navigation]);

  return null;
}
