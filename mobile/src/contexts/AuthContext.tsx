import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

// Única fuente de sesión para toda la app — envuelve exactamente el mismo
// flujo que LoginForm.tsx en la web (supabase.auth.signInWithPassword),
// pero la sesión persiste en AsyncStorage en vez de cookies (ver
// lib/supabase.ts). onAuthStateChange es lo que hace la persistencia
// "real" entre reinicios de la app: al montar, supabase-js ya intenta
// restaurar la sesión guardada antes de que este listener dispare su
// primer evento.
type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      async signIn(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) return { error: null };
        // Mismos tres mensajes que LoginForm.tsx (app web) — nunca un
        // segundo texto para el mismo caso.
        if (error.message.includes("Invalid login credentials") || error.message.includes("invalid_credentials")) {
          return { error: "Correo o contraseña incorrectos." };
        }
        if (error.message.includes("Email not confirmed")) {
          return { error: "Por favor confirma tu correo electrónico antes de entrar." };
        }
        return { error: "Error al iniciar sesión. Por favor, intenta de nuevo." };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
