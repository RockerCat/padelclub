import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type NotificationRow = {
  id: string;
  club_id: string | null;
  type: string;
  title: string;
  message: string;
  metadata: { destination?: string; join_request_id?: string; club_slug?: string; [key: string]: unknown } | null;
  read_at: string | null;
  created_at: string;
  clubs: { slug: string; name: string } | null;
};

// Single source of truth for "how many unread notifications does this user
// have" — used by the bell badge. Scoped to auth.uid() only via
// notifications_select_own RLS, no explicit profile filter needed.
export async function getUnreadNotificationCount(
  supabase: SupabaseClient<Database>
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  // A permission/RLS error must never silently render as "0 unread" — that
  // exact silence is why the missing GRANT (see migration
  // 20260730000001_grant_notifications_authenticated.sql) went undetected.
  if (error) console.error("[getUnreadNotificationCount] failed:", error);

  return count ?? 0;
}

// Joins clubs(slug, name) so the bell dropdown can link straight to the
// right screen (admin's Solicitudes de ingreso, or the player's Mis
// clubes) without a second round trip.
// Bell-scoped: the dropdown only ever shows 5 rows (see NotificationBell),
// so the default fetches one extra (6) purely to know whether a "Ver todas
// las notificaciones" link is worth showing, without a separate count
// query. The full-history view is getNotificationsPaginated below.
export async function getRecentNotifications(
  supabase: SupabaseClient<Database>,
  limit = 6
): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, club_id, type, title, message, metadata, read_at, created_at, clubs(slug, name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) console.error("[getRecentNotifications] failed:", error);

  return (data ?? []) as unknown as NotificationRow[];
}

// Powers /notifications' "Cargar más" pagination — fetches one row beyond
// `limit` to derive `hasMore` without a second exact-count query, then
// trims it back off before returning.
export async function getNotificationsPaginated(
  supabase: SupabaseClient<Database>,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<{ items: NotificationRow[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, club_id, type, title, message, metadata, read_at, created_at, clubs(slug, name)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) console.error("[getNotificationsPaginated] failed:", error);

  const rows = (data ?? []) as unknown as NotificationRow[];
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

// Shared by the bell dropdown and /notifications so a click behaves
// identically in both places — one routing decision, never two.
export function hrefForNotification(n: NotificationRow): string | null {
  if (n.metadata?.destination) return n.metadata.destination;
  if (n.type === "join_request_created") {
    return n.clubs ? `/${n.clubs.slug}/admin/players` : null;
  }
  if (n.type === "join_request_approved") {
    // New rows carry metadata.destination (caught above). Historical rows
    // predating that still resolve correctly via the clubs(slug,name) join —
    // club_id was always set on this notification type, so this is never a
    // name/text-based guess. Only a genuinely missing club falls back.
    return n.clubs ? `/${n.clubs.slug}` : "/clubs";
  }
  if (n.type === "join_request_rejected") {
    return "/clubs";
  }
  return null;
}

export function formatRelativeNotificationTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}
