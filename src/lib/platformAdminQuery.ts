import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Single source of truth for "is this profile a platform admin", shared by
// isPlatformAdmin() (server-only, via src/lib/platformAdmin.ts) and any auth
// flow that already holds a Supabase client + user id and must decide a
// post-login destination in the same request/session (LoginForm, the auth
// callback route) — those can't call isPlatformAdmin() itself since it
// creates its own server client via next/headers, which isn't safe to
// import from a "use client" module and wouldn't see a session established
// moments earlier on a different client instance.
export async function checkProfileIsPlatformAdmin(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .single();

  return data?.is_platform_admin ?? false;
}
