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
  // is_platform_admin has no general SELECT grant since the profiles
  // privacy fix (20261114000002) — get_my_profile() is self-only by
  // construction (derives id from auth.uid()), so `userId` here must
  // always be the current session's own id, same as every existing caller
  // already passes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- get_my_profile added in 20261114000002, not yet in generated types until `npm run types:generate` runs against a DB with this migration applied.
  const { data } = await (supabase.rpc as any)("get_my_profile");
  const row = data?.[0];
  return row?.is_platform_admin ?? false;
}
