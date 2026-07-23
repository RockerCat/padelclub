import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Single source of truth for "how many pending join requests does this club
// have" — used by both the sidebar nav badge (count only, head request) and
// the Jugadores page. Requests now carry a real status (pending/approved/
// rejected, see migration 20260727000002), so this must filter explicitly
// instead of counting every row.
export async function getPendingJoinRequestsCount(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<number> {
  const { count } = await supabase
    .from("club_join_requests")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("status", "pending");

  return count ?? 0;
}
