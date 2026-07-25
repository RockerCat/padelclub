import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type SidebarIdentityData = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

// Resolves the signed-in user's display identity for the sidebar, once,
// reused by both the club layout and the platform layout — never two
// separate name-resolution implementations. profiles.full_name is the real
// source of truth (never user_metadata); the session email (passed in,
// already available from the caller's own supabase.auth.getUser() call —
// this never re-fetches the session) is the fallback, then a neutral
// "Usuario" as the last resort. profiles has no email/display_name column
// (see src/types/database.ts), so those tiers don't apply here.
export async function getSidebarIdentity(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null
): Promise<SidebarIdentityData> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const fullName = profile?.full_name?.trim();
  const name = fullName || email || "Usuario";

  return { name, email, avatarUrl: profile?.avatar_url ?? null };
}
