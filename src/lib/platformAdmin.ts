import { createClient } from "@/lib/supabase/server";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";

// Platform admin is a flag on profiles, orthogonal to club_members.role.
// It identifies platform operators, not club-level OWNER/ADMIN/PLAYER.
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  return checkProfileIsPlatformAdmin(supabase, user.id);
}
