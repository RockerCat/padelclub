import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { resolveActiveMembership, type ActiveMembership } from "../lib/activeMembership";
import { getIdentity, type IdentityData } from "../lib/userIdentity";

// Resuelve, una sola vez por sesión, a qué club y con qué rol entra este
// usuario — misma regla que resolveActiveMembership en la web (ver
// lib/activeMembership.ts). Este vertical slice no incluye el selector de
// club (/clubs) ni ningún flujo OWNER/ADMIN operativo: si el usuario no
// tiene ninguna membresía activa no archivada, club queda en null y la
// pantalla que consuma este contexto debe mostrar ese caso explícitamente
// en vez de asumir que siempre hay un club.
//
// pendingNav: una notificación puede pertenecer a un club distinto del
// activo (PLAYER puede estar en varios) — a diferencia de WEB (cada URL ya
// codifica su propio club, sin estado "activo"), mobile solo tiene un club
// activo a la vez y AppTabs se remonta por completo al cambiarlo (ver
// RootNavigator.tsx → AppShell, `key={club?.id}`). NotificationsScreen deja
// aquí la navegación pendiente ANTES de disparar el cambio de club;
// PlayerTabs (recién remontado, ya con el club correcto) la consume en un
// efecto propio apenas monta — el único punto de sincronización seguro,
// ya que cualquier navigate() emitido antes del remount se perdería con él.
export type PendingTabNav = { tab: string; screen?: string; params?: Record<string, unknown> };

// pendingRootNav: separado de pendingNav a propósito — pendingNav es para
// screens de tabs anidados (consumido por el efecto de PlayerTabs, que se
// remonta al cambiar de club). ReservationDetail vive en el stack RAÍZ
// (RootNavigator.tsx), fuera de ese árbol que se remonta — necesita su
// propio estado mínimo, consumido por un componente que nunca se remonta
// (PushNotificationNavigator), una vez el club ya esté commiteado
// (loading === false), nunca inmediatamente después de un `await
// reloadClub()` (esa inmediatez es exactamente la carrera que este estado
// existe para evitar).
export type PendingRootNav = { screen: "ReservationDetail"; params: { id: string } };

type ClubContextValue = {
  club: ActiveMembership["club"] | null;
  role: string | null;
  clubMemberId: string | null;
  identity: IdentityData | null;
  loading: boolean;
  // Distinto de `loading` (bootstrap-only, ver hasLoadedOnceRef abajo) —
  // `reloading` sí se pone en true en CADA llamada a reload(), incluida una
  // revalidación en segundo plano. Es la señal que PushNotificationNavigator/
  // NotificationsScreen necesitan para saber cuándo un `await reload()` ya
  // terminó de asentarse en un render real (y por lo tanto cuándo es seguro
  // navegar) sin volver a acoplar eso a `loading`, que ya no sirve para eso
  // (ver comentario en `hasLoadedOnceRef`).
  reloading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  pendingNav: PendingTabNav | null;
  setPendingNav: (nav: PendingTabNav | null) => void;
  pendingRootNav: PendingRootNav | null;
  setPendingRootNav: (nav: PendingRootNav | null) => void;
};

const ClubContext = createContext<ClubContextValue | null>(null);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [club, setClub] = useState<ActiveMembership["club"] | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [clubMemberId, setClubMemberId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<PendingTabNav | null>(null);
  const [pendingRootNav, setPendingRootNav] = useState<PendingRootNav | null>(null);

  // Distingue la carga INICIAL (bootstrap, primera vez que esta sesión
  // resuelve su club — ahí sí debe bloquear con el splash de
  // AuthenticatedNavigator) de una revalidación en segundo plano
  // (`reload()`, llamado desde ChangeClubScreen/PushNotificationNavigator/
  // NotificationsScreen para reflejar un cambio de acceso real). Antes,
  // `loading` era una sola bandera para ambos casos — `reload()` ponía
  // `loading = true` igual que el bootstrap, y AuthenticatedNavigator
  // (`if (clubLoading) return <Splash/>`) desmontaba TODO el árbol
  // (MainStack/NoClubStack) cada vez que se llamaba `reload()`, mostrando
  // el splash global. Para un usuario sin club activo (NoClubStack, donde
  // ChangeClubScreen es la única pantalla raíz), ese desmontaje forzaba un
  // remontaje completo de ChangeClubScreen, cuyo propio useFocusEffect
  // volvía a llamar `reload()` de inmediato — mount → focus → reload →
  // loading=true → splash → desmonta → remonta → focus → reload → loop
  // infinito, exactamente el síntoma reportado ("no llega a MainStack,
  // NoClubStack ni ninguna pantalla"). Ref (no state) a propósito: no debe
  // disparar un re-render por sí sola, solo decidir si ESTA llamada a
  // load() toca `loading`.
  const hasLoadedOnceRef = useRef(false);

  const load = useCallback(async () => {
    if (!session?.user) {
      setClub(null);
      setRole(null);
      setClubMemberId(null);
      setIdentity(null);
      setLoading(false);
      setReloading(false);
      hasLoadedOnceRef.current = false;
      return;
    }
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    setReloading(true);
    setError(null);
    try {
      const [membership, identityData] = await Promise.all([
        resolveActiveMembership(supabase, session.user.id),
        getIdentity(supabase, session.user.id, session.user.email ?? null),
      ]);
      setClub(membership?.club ?? null);
      setRole(membership?.role ?? null);
      setClubMemberId(membership?.clubMemberId ?? null);
      setIdentity(identityData);
    } catch {
      // Un reload en segundo plano que falla nunca debe reemplazar datos
      // ya buenos con un error visible — mismo criterio "nunca romper lo
      // que ya funciona" que el resto del reload silencioso en la app.
      if (isFirstLoad) setError("No pudimos cargar la información del club. Desliza para reintentar.");
    } finally {
      if (isFirstLoad) setLoading(false);
      setReloading(false);
      hasLoadedOnceRef.current = true;
    }
  }, [session?.user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ClubContext.Provider
      value={{
        club,
        role,
        clubMemberId,
        identity,
        loading,
        reloading,
        error,
        reload: load,
        pendingNav,
        setPendingNav,
        pendingRootNav,
        setPendingRootNav,
      }}
    >
      {children}
    </ClubContext.Provider>
  );
}

export function useClub(): ClubContextValue {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub debe usarse dentro de ClubProvider");
  return ctx;
}
