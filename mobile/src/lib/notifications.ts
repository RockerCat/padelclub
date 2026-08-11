import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de getUnreadNotificationCount en src/lib/notifications.ts (app
// web) — misma query exacta, RLS-scoped (notifications_select_own), sin
// filtro explícito de profile_id.
export async function getUnreadNotificationCount(supabase: SupabaseClient<Database>): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
