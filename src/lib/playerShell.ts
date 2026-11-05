import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getRecentNotifications, getUnreadNotificationCount, type NotificationRow } from "@/lib/notifications";

// "Mi Pádel" — experiencia global del jugador (CLAUDE.md → Player Home
// Principles). Decide UNA sola vez quién la recibe:
//
//   - cuenta autenticada,
//   - nunca SUPERADMIN (is_platform_admin o account_type SUPERADMIN),
//   - nunca OWNER/ADMIN (account_type es global y permanente, y la base
//     garantiza que coincide con todo rol de club_members — ver Role
//     Philosophy —, así que una cuenta OWNER/ADMIN jamás tiene una
//     membresía PLAYER: no existen "roles mixtos" que combinar).
//
// Es decir: PLAYER, o una cuenta recién creada sin account_type todavía.
// Los demás conservan exactamente sus destinos administrativos.
export const PLAYER_HOME_PATH = "/mi-padel";

export interface PlayerShellContext {
  name: string;
  avatarUrl: string | null;
  notificationCount: number;
  notificationItems: NotificationRow[];
}

type MyProfileRow = {
  account_type: string | null;
  is_platform_admin: boolean | null;
  full_name: string | null;
  avatar_url: string | null;
};

/** Lectura self-only (get_my_profile deriva el id de auth.uid()). */
export async function getMyProfileRow(supabase: SupabaseClient<Database>): Promise<MyProfileRow | null> {
  const { data } = await supabase.rpc("get_my_profile");
  return ((data as unknown as MyProfileRow[] | null) ?? [])[0] ?? null;
}

export function isPlayerExperienceProfile(profile: MyProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.is_platform_admin) return false;
  return profile.account_type === null || profile.account_type === "PLAYER";
}

/**
 * Contexto del shell personal, o null si este usuario no recibe la
 * experiencia de jugador (visitante, OWNER/ADMIN o SUPERADMIN).
 */
export async function getPlayerShellContext(
  supabase: SupabaseClient<Database>,
  user: { id: string; email?: string | null } | null
): Promise<PlayerShellContext | null> {
  if (!user) return null;
  const profile = await getMyProfileRow(supabase);
  if (!isPlayerExperienceProfile(profile)) return null;

  const [notificationCount, notificationItems] = await Promise.all([
    getUnreadNotificationCount(supabase),
    getRecentNotifications(supabase),
  ]);

  return {
    name: profile?.full_name?.trim() || user.email || "Jugador",
    avatarUrl: profile?.avatar_url ?? null,
    notificationCount,
    notificationItems,
  };
}
