import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Single source of truth for "how many pending join requests does this club
// have" — every row in club_join_requests is implicitly pending (approving
// or rejecting one deletes it, see the club_join_requests migration), so the
// count is just the row count for the club. Used by both the sidebar nav
// badge (count only, head request) and the Jugadores page (full rows).
export async function getPendingJoinRequestsCount(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<number> {
  const { count } = await supabase
    .from("club_join_requests")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId);

  return count ?? 0;
}

// A public club lets anyone join directly, so a pending join request stops
// making sense the moment a club switches from private to public — call
// this right after that save succeeds. We delete the rows outright instead
// of introducing a "cancelled" status: the table has no status column today
// (every row is implicitly pending), and approveJoinRequest/rejectJoinRequest
// already resolve a request the same way (delete it), so this keeps a single
// resolution mechanism instead of adding a parallel one just for this case.
export async function cancelPendingJoinRequestsForPublicClub(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<void> {
  await supabase.from("club_join_requests").delete().eq("club_id", clubId);
}
