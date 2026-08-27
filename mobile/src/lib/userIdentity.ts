import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado literal de getSidebarIdentity en src/lib/userIdentity.ts (app
// web) — misma fuente de verdad (profiles.full_name, nunca user_metadata),
// mismo fallback a email y luego "Usuario".
export type IdentityData = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

// Mismo defecto (y mismo fix) que fetchActiveMembershipRows en
// activeMembership.ts: un `error` real de esta consulta (misma ventana de
// carrera post-login que esa función ya cubre) nunca debe leerse como "el
// profile no tiene full_name/avatar_url" — antes, `{ data }` descartaba el
// `error` en silencio, así que un fallo transitorio caía al fallback de
// email/inicial exactamente igual que un profile genuinamente vacío. Con
// el fix de activeMembership.ts, el club ya resuelve bien en esa misma
// ventana — pero esta consulta, sin el mismo reintento, seguía perdiendo
// esa carrera, y el Dashboard mostraba el email en vez de
// profiles.full_name/avatar_url. Un solo reintento inmediato cubre el
// mismo caso transitorio; si el segundo intento también falla, recién ahí
// se usa el fallback real (nunca antes).
async function fetchProfileIdentity(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ full_name: string | null; avatar_url: string | null } | null> {
  const { data, error } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getIdentity(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null
): Promise<IdentityData> {
  let profile: { full_name: string | null; avatar_url: string | null } | null;
  try {
    profile = await fetchProfileIdentity(supabase, userId);
  } catch {
    profile = await fetchProfileIdentity(supabase, userId);
  }

  const fullName = profile?.full_name?.trim();
  const name = fullName || email || "Usuario";

  return { name, email, avatarUrl: profile?.avatar_url ?? null };
}
