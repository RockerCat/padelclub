import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Equivalente nativo de src/lib/supabase/client.ts (app web) — misma URL y
// misma anon key (ver mobile/.env), mismo proyecto Supabase, sin backend
// duplicado. La web persiste sesión en cookies (createBrowserClient de
// @supabase/ssr, pensado para SSR); aquí no hay servidor ni cookies, así
// que la sesión se persiste en AsyncStorage — el equivalente nativo
// estándar de supabase-js — con autoRefreshToken para que no expire en
// background. detectSessionInUrl siempre false: no hay URL de navegador ni
// callback OAuth que parsear en este vertical slice (solo login por
// contraseña).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copia mobile/.env.example a mobile/.env y completa los valores del mismo proyecto Supabase que usa la app web (.env.local en la raíz del repo)."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
