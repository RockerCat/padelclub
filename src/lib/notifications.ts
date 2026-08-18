// NotificationRow y las tres queries (getUnreadNotificationCount/
// getRecentNotifications/getNotificationsPaginated) más
// formatRelativeNotificationTime ya NO se definen aquí — viven en
// shared/notifications/notifications.ts (misma fuente que ahora también
// usa mobile), re-exportadas bajo estos mismos nombres para que ningún
// import existente de "@/lib/notifications" tenga que cambiar.
export type { NotificationRow } from "../../shared/notifications/notifications";
export {
  getUnreadNotificationCount,
  getRecentNotifications,
  getNotificationsPaginated,
  formatRelativeNotificationTime,
} from "../../shared/notifications/notifications";

import type { NotificationRow } from "../../shared/notifications/notifications";

// Shared by the bell dropdown and /notifications so a click behaves
// identically in both places — one routing decision, never two. WEB-only:
// returns a Next.js URL path, meaningless for React Navigation — mobile's
// equivalent (mobile/src/lib/notificationNav.ts) mirrors this exact
// routing logic but resolves to RN nav targets instead.
export function hrefForNotification(n: NotificationRow): string | null {
  if (n.type === "reservation_request_rejected") {
    // Deliberately checked BEFORE metadata.destination below: existing rows
    // (created by notify_reservation_rejected, 20260804000001) still carry
    // the old "#mis-solicitudes" destination, which only scrolls to the
    // bottom history — never the contextual top block. reservation_id has
    // been in metadata since this notification type was introduced, so it
    // can always drive the real per-reservation context instead, with no
    // migration needed to move existing rows off the old destination.
    const reservationId = n.metadata?.reservation_id;
    const slug = n.clubs?.slug ?? (typeof n.metadata?.club_slug === "string" ? n.metadata.club_slug : undefined);
    if (reservationId && slug) return `/${slug}/reservations?reservationId=${reservationId}`;
    return n.metadata?.destination ?? (n.clubs ? `/${n.clubs.slug}/reservations#mis-solicitudes` : null);
  }
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
  if (n.type === "reservation_request_created") {
    // metadata.destination (set at creation, see 20260801000001) always
    // resolves this directly to the review screen — this branch is only a
    // safety net for a row that somehow lost its metadata.
    return n.clubs ? `/${n.clubs.slug}/admin/reservations` : null;
  }
  return null;
}
