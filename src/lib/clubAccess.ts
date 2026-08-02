import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";

export type ClubAccess =
  | {
      authorized: true;
      user: NonNullable<Awaited<ReturnType<SupabaseClient<Database>["auth"]["getUser"]>>["data"]["user"]>;
      /** Effective role for capability checks — "OWNER" whenever isSuperadminAccess is true. */
      role: "OWNER" | "ADMIN" | "PLAYER";
      /** True when this access is elevated platform access, not a real club_members row. */
      isSuperadminAccess: boolean;
    }
  | { authorized: false; error: "No autenticado." | "Sin permiso." };

// Central authorization resolver for club-scoped server actions — SUPERADMIN
// "Entrar al club". A real club_members row always wins and behaves exactly
// as before (isSuperadminAccess: false); only when the caller has none does
// this fall back to elevated access (profiles.is_platform_admin, only for
// an ACTIVE club). Never creates a club_members row, never grants access to
// an inactive club, never touches the real OWNER. See
// supabase/migrations/20261008000001_superadmin_club_access.sql for the
// matching, narrowly-scoped RLS/RPC-side changes this depends on.
export async function resolveClubAccess(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<ClubAccess> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { authorized: false, error: "No autenticado." };
  }

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (membership && (membership.role === "OWNER" || membership.role === "ADMIN" || membership.role === "PLAYER")) {
    return { authorized: true, user, role: membership.role, isSuperadminAccess: false };
  }

  if (await checkProfileIsPlatformAdmin(supabase, user.id)) {
    const { data: club } = await supabase.from("clubs").select("is_active").eq("id", clubId).single();
    if (club?.is_active) {
      return { authorized: true, user, role: "OWNER", isSuperadminAccess: true };
    }
  }

  return { authorized: false, error: "Sin permiso." };
}
