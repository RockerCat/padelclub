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

export async function getIdentity(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null
): Promise<IdentityData> {
  const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();

  const fullName = profile?.full_name?.trim();
  const name = fullName || email || "Usuario";

  return { name, email, avatarUrl: profile?.avatar_url ?? null };
}
