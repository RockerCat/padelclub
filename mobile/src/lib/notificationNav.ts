import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { NotificationRow } from "./notifications";

// Mirrors hrefForNotification (src/lib/notifications.ts, app web) exactly —
// same precedence (reservation_request_rejected's own reservation_id-first
// rule, checked before metadata.destination; metadata.destination generic
// parsing next; then the historical-row type-specific fallbacks last), same
// fields read (n.type, n.metadata, n.clubs). It never re-derives a routing
// DECISION WEB doesn't already make — it only translates the destination
// WEB would compute (a Next.js URL path) into a React Navigation target,
// since mobile has no URL router and no multi-club-at-once routing (a
// single ClubContext holds one active club at a time — see
// ChangeClubScreen). This is the one and only place mobile interprets a
// notification's destination; never duplicated per screen.
export type NotificationNavTarget =
  | { kind: "club_home" } // bare `/${slug}` — the public club page, mobile's ClubHomeTab
  | { kind: "reservation_detail"; reservationId: string }
  | { kind: "reservations_list" }
  | { kind: "tournament_detail"; tournamentSlug: string }
  | { kind: "change_club" } // `/clubs`
  | { kind: "none" };

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Handles every real `metadata.destination` shape found across the
// notify_* migrations for a club-scoped or `/clubs` path: bare `/${slug}`,
// `/${slug}/reservations` (+ `?reservationId=` or bare `/${id}` segment —
// both used across different notify_* functions, see
// 20261105000001_expire_pending_reservations.sql for the raw-uuid-segment
// one), `/${slug}/tournaments/{slug}`, and every `/${slug}/admin/...` shape
// (OWNER/ADMIN-only in practice — a PLAYER's own notifications never carry
// one, but if they somehow did, landing on the club's home is an honest,
// safe fallback rather than silently doing nothing).
function parseGenericDestination(destination: string | undefined, slug: string | null): NotificationNavTarget | null {
  if (!destination) return null;
  if (destination === "/clubs") return { kind: "change_club" };
  if (!slug) return null;

  const prefix = `/${slug}`;
  if (destination === prefix) return { kind: "club_home" };
  if (!destination.startsWith(`${prefix}/`)) return null;

  const rest = destination.slice(prefix.length); // starts with "/"

  if (rest.startsWith("/reservations")) {
    const queryMatch = rest.match(new RegExp(`reservationId=(${UUID_RE.source})`, "i"));
    if (queryMatch) return { kind: "reservation_detail", reservationId: queryMatch[1] };
    const pathMatch = rest.match(new RegExp(`^/reservations/(${UUID_RE.source})`, "i"));
    if (pathMatch) return { kind: "reservation_detail", reservationId: pathMatch[1] };
    return { kind: "reservations_list" }; // "/reservations", "/reservations#mis-solicitudes"
  }

  if (rest.startsWith("/tournaments/")) {
    const tournamentSlug = rest.slice("/tournaments/".length).split(/[?#]/)[0];
    if (tournamentSlug) return { kind: "tournament_detail", tournamentSlug };
  }

  return { kind: "club_home" };
}

export function resolveNotificationTarget(n: NotificationRow): NotificationNavTarget {
  const slug = n.clubs?.slug ?? (typeof n.metadata?.club_slug === "string" ? n.metadata.club_slug : null);
  const destination = typeof n.metadata?.destination === "string" ? n.metadata.destination : undefined;

  if (n.type === "reservation_request_rejected") {
    const reservationId = typeof n.metadata?.reservation_id === "string" ? n.metadata.reservation_id : null;
    if (reservationId) return { kind: "reservation_detail", reservationId };
    return parseGenericDestination(destination, slug) ?? (slug ? { kind: "reservations_list" } : { kind: "none" });
  }

  const generic = parseGenericDestination(destination, slug);
  if (generic) return generic;

  if (n.type === "join_request_created") return slug ? { kind: "club_home" } : { kind: "none" };
  if (n.type === "join_request_approved") return slug ? { kind: "club_home" } : { kind: "change_club" };
  if (n.type === "join_request_rejected") return { kind: "change_club" };
  if (n.type === "reservation_request_created") return slug ? { kind: "reservations_list" } : { kind: "none" };
  return { kind: "none" };
}

export type TabNavSpec = {
  tab: "HomeTab" | "ClubHomeTab" | "ReservasTab" | "RankingTab" | "TournamentsTab";
  screen?: string;
  params?: Record<string, unknown>;
};

// Resolves a target into the exact nested tab/screen/params PlayerTabs
// exposes (see AppTabs.tsx → PlayerTabsParamList) — the ONLY async step is
// a tournament slug→id lookup (metadata only ever carries the slug, but
// TournamentDetailScreen needs the real id, scoped by club_id). A plain
// read against `tournaments`, no RPC, no schema change — same club_id the
// notification itself carries, never the caller's currently-active club
// (a notification can belong to a club that isn't active yet — see
// NotificationsScreen's cross-club switch-then-navigate flow).
export async function buildTabNav(
  supabase: SupabaseClient<Database>,
  target: NotificationNavTarget,
  clubId: string
): Promise<TabNavSpec | null> {
  switch (target.kind) {
    case "reservation_detail":
      return { tab: "ReservasTab", screen: "ReservationDetail", params: { id: target.reservationId } };
    case "reservations_list":
      return { tab: "ReservasTab" };
    case "club_home":
      return { tab: "ClubHomeTab" };
    case "tournament_detail": {
      const { data } = await supabase.from("tournaments").select("id").eq("club_id", clubId).eq("slug", target.tournamentSlug).maybeSingle();
      return data?.id ? { tab: "TournamentsTab", screen: "TournamentDetail", params: { tournamentId: data.id } } : { tab: "TournamentsTab" };
    }
    case "change_club":
    case "none":
      return null;
  }
}
