import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// The reusable core of src/lib/notifications.ts (app web) — same
// `NotificationRow` shape, same three queries, same relative-time
// formatting. WEB re-exports all of this under its historical name so no
// existing import changes; `hrefForNotification` itself stays WEB-only
// (returns Next.js URL paths, meaningless for React Navigation) — mobile's
// own destination resolver (mobile/src/lib/notificationNav.ts) mirrors its
// exact routing rules instead, producing RN nav targets. See CLAUDE.md →
// Notifications & Live-Update Principles: one notification system, never a
// second query/read/unread implementation per surface.

export type NotificationRow = {
  id: string;
  club_id: string | null;
  type: string;
  title: string;
  message: string;
  metadata: { destination?: string; join_request_id?: string; reservation_id?: string; club_slug?: string; [key: string]: unknown } | null;
  read_at: string | null;
  // Shared business-entity resolution (join request / reservation request
  // approved or rejected by ANY authorized recipient) — distinct from
  // read_at, which stays per-user. Null for notification types with no
  // resolution concept (e.g. join_request_approved itself).
  resolved_status: "approved" | "rejected" | null;
  resolved_at: string | null;
  created_at: string;
  clubs: { slug: string; name: string } | null;
};

// Single source of truth for "how many unread notifications does this user
// have" — used by the bell badge on both platforms. Scoped to auth.uid()
// only via notifications_select_own RLS, no explicit profile filter needed.
export async function getUnreadNotificationCount(supabase: SupabaseClient<Database>): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);

  // A permission/RLS error must never silently render as "0 unread" — that
  // exact silence is why the missing GRANT (see migration
  // 20260730000001_grant_notifications_authenticated.sql) went undetected.
  if (error) console.error("[getUnreadNotificationCount] failed:", error);

  return count ?? 0;
}

// Joins clubs(slug, name) so the caller can link straight to the right
// screen without a second round trip. Bell-scoped: the dropdown/mobile
// bell only ever shows a handful of rows, so the default fetches one extra
// purely to know whether a "Ver todas"/"Cargar más" affordance is worth
// showing, without a separate count query. The full-history view is
// getNotificationsPaginated below.
export async function getRecentNotifications(supabase: SupabaseClient<Database>, limit = 6): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, club_id, type, title, message, metadata, read_at, resolved_status, resolved_at, created_at, clubs(slug, name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) console.error("[getRecentNotifications] failed:", error);

  return (data ?? []) as unknown as NotificationRow[];
}

// Powers the full notifications history's "Cargar más"/"Load more"
// pagination — fetches one row beyond `limit` to derive `hasMore` without a
// second exact-count query, then trims it back off before returning.
export async function getNotificationsPaginated(
  supabase: SupabaseClient<Database>,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<{ items: NotificationRow[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, club_id, type, title, message, metadata, read_at, resolved_status, resolved_at, created_at, clubs(slug, name)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) console.error("[getNotificationsPaginated] failed:", error);

  const rows = (data ?? []) as unknown as NotificationRow[];
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
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
