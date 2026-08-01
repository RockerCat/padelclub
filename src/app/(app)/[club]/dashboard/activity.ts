import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { clubHubPath } from "@/lib/clubHubPaths";

// Actividad Reciente (Vista 3) — a compact cross-module timeline composed
// server-side from data that already exists, with no new table, trigger, or
// audit log (see dashboard reorganization block, CLAUDE.md). Every source
// query is capped and club-scoped; results are merged and sorted once, here,
// so the view never re-implements this per source.

export type ActivityType = "reservation" | "join_request" | "player" | "tournament" | "news";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  date: Date;
  title: string;
  description: string;
  href: string | null;
}

const PER_SOURCE_LIMIT = 10;

const RESERVATION_TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  confirmed: "confirmada",
  cancelled: "cancelada",
  rejected: "rechazada",
};

export async function getRecentActivity(
  supabase: SupabaseClient<Database>,
  clubId: string,
  slug: string
): Promise<ActivityItem[]> {
  const [reservationsRes, joinRequestsRes, playersRes, tournamentsRes, newsRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, date, start_time, type, status, created_at, courts(name)")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),

    supabase
      .from("club_join_requests")
      .select("id, created_at, profiles(full_name)")
      .eq("club_id", clubId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),

    supabase
      .from("club_members")
      .select("id, joined_at, profiles(full_name)")
      .eq("club_id", clubId)
      .eq("role", "PLAYER")
      .eq("is_active", true)
      .order("joined_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),

    supabase
      .from("tournaments")
      .select("id, name, slug, status, created_at, started_at, completed_at")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),

    supabase
      .from("club_news")
      .select("id, title, published_at")
      .eq("club_id", clubId)
      .order("published_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
  ]);

  const items: ActivityItem[] = [];

  type ReservationRow = {
    id: string;
    date: string;
    start_time: string;
    type: string;
    status: string;
    created_at: string;
    courts: { name: string } | null;
  };
  for (const r of (reservationsRes.data ?? []) as unknown as ReservationRow[]) {
    items.push({
      id: `reservation-${r.id}`,
      type: "reservation",
      date: new Date(r.created_at),
      title: "Reserva registrada",
      description: `${RESERVATION_TYPE_LABELS[r.type] ?? r.type} · ${r.courts?.name ?? "—"} · ${r.date} ${r.start_time.slice(0, 5)} · ${RESERVATION_STATUS_LABELS[r.status] ?? r.status}`,
      href: `/${slug}/admin/reservations/${r.id}`,
    });
  }

  type JoinRequestRow = { id: string; created_at: string; profiles: { full_name: string | null } | null };
  for (const jr of (joinRequestsRes.data ?? []) as unknown as JoinRequestRow[]) {
    items.push({
      id: `join_request-${jr.id}`,
      type: "join_request",
      date: new Date(jr.created_at),
      title: "Solicitud de ingreso",
      description: `${jr.profiles?.full_name ?? "Un jugador"} solicitó unirse al club`,
      href: `/${slug}/admin/players`,
    });
  }

  type PlayerRow = { id: string; joined_at: string; profiles: { full_name: string | null } | null };
  for (const m of (playersRes.data ?? []) as unknown as PlayerRow[]) {
    items.push({
      id: `player-${m.id}`,
      type: "player",
      date: new Date(m.joined_at),
      title: "Jugador incorporado",
      description: `${m.profiles?.full_name ?? "Un jugador"} se unió al club`,
      href: `/${slug}/admin/players`,
    });
  }

  type TournamentRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  };
  for (const t of (tournamentsRes.data ?? []) as unknown as TournamentRow[]) {
    const href = `/${slug}/admin/tournaments/${t.slug}`;
    items.push({
      id: `tournament_created-${t.id}`,
      type: "tournament",
      date: new Date(t.created_at),
      title: "Torneo creado",
      description: t.name,
      href,
    });
    if (t.started_at) {
      items.push({
        id: `tournament_started-${t.id}`,
        type: "tournament",
        date: new Date(t.started_at),
        title: "Torneo iniciado",
        description: t.name,
        href,
      });
    }
    if (t.completed_at) {
      items.push({
        id: `tournament_completed-${t.id}`,
        type: "tournament",
        date: new Date(t.completed_at),
        title: "Torneo finalizado",
        description: t.name,
        href,
      });
    }
  }

  type NewsRow = { id: string; title: string; published_at: string };
  for (const n of (newsRes.data ?? []) as unknown as NewsRow[]) {
    items.push({
      id: `news-${n.id}`,
      type: "news",
      date: new Date(n.published_at),
      title: "Noticia publicada",
      description: n.title,
      href: clubHubPath(slug, "noticias"),
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items.slice(0, 20);
}
