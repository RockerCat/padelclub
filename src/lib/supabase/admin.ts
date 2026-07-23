import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service-role client for the Supabase Admin API (auth.admin.*) — email,
// password and ban/unban changes must go through GoTrue itself (hashing,
// uniqueness, session invalidation), never a direct SQL UPDATE on
// auth.users. The service role key bypasses RLS entirely, so this must
// only ever be created inside a server action, and every caller is
// responsible for checking isPlatformAdmin() first.
//
// Returns null if SUPABASE_SERVICE_ROLE_KEY isn't set in this environment
// — callers must handle that by surfacing a "not configured" message
// instead of crashing. The key is read from process.env only; it is never
// hardcoded here and never sent to the client.
export function createAdminClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
