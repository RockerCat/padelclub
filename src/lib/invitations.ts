import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Single-use, non-expiring invitation links — the model used by both the
// player and admin invitation flows (see InviteLinkList). The
// invitation_links.expires_at column is NOT NULL with a 7-day DB default, so
// instead of a migration we override it at insert time with a far-future
// sentinel — validity then depends only on max_uses/uses and is_active,
// without touching the schema or the shared claim_invitation/
// get_invitation_preview RPCs (which still compare against expires_at).
export const INVITE_NEVER_EXPIRES = "2999-12-31T23:59:59.000Z";

export function insertSingleUseInvite(
  supabase: SupabaseClient<Database>,
  params: { clubId: string; role: "PLAYER" | "ADMIN"; createdBy: string }
) {
  return supabase
    .from("invitation_links")
    .insert({
      club_id: params.clubId,
      role: params.role,
      created_by: params.createdBy,
      max_uses: 1,
      expires_at: INVITE_NEVER_EXPIRES,
    })
    .select("token")
    .single();
}
