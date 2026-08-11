import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
type ClubContextValue = {
  club: ActiveMembership["club"] | null;
  role: string | null;
  identity: IdentityData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const ClubContext = createContext<ClubContextValue | null>(null);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [club, setClub] = useState<ActiveMembership["club"] | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user) {
      setClub(null);
      setRole(null);
      setIdentity(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [membership, identityData] = await Promise.all([
        resolveActiveMembership(supabase, session.user.id),
        getIdentity(supabase, session.user.id, session.user.email ?? null),
      ]);
      setClub(membership?.club ?? null);
      setRole(membership?.role ?? null);
      setIdentity(identityData);
    } catch {
      setError("No pudimos cargar la información del club. Desliza para reintentar.");
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ClubContext.Provider value={{ club, role, identity, loading, error, reload: load }}>{children}</ClubContext.Provider>
  );
}

export function useClub(): ClubContextValue {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub debe usarse dentro de ClubProvider");
  return ctx;
}
