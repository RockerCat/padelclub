import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Single source of truth for a player's own reservation activity — "Mis
// solicitudes" (myReservations) and "Mis reservas" (myBookings) — reused by
// both the Reservations page (src/app/(app)/[club]/reservations/page.tsx)
// and the player home page (src/app/(app)/[club]/home/page.tsx) so neither
// can drift from the other's rules or issue a second, slightly different
// version of the same queries.

export type MyReservation = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  status: "pending" | "confirmed" | "cancelled" | "rejected";
  court_id: string;
  courtName: string;
  // Who created it — being a reservation_players participant never grants
  // edit permission (Phase 7), only the creator does. Needed here (rather
  // than re-deriving per-card) since myBookings mixes self-requested and
  // OWNER/ADMIN-added-as-participant rows, which look identical otherwise.
  created_by: string;
  // Frozen at request time (see requestReservation) — null for reservations
  // predating the pricing engine, or when no tariff applied. Never a live
  // recalculation: this is exactly what was charged when requested.
  price_amount: number | null;
  price_currency: string | null;
  // Only set once status === "rejected" — same reason text and timestamp
  // shown to OWNER/ADMIN, never a second/different message.
  rejection_reason: string | null;
  rejected_at: string | null;
  // Solo para el mensaje de "WhatsApp" (buildReservationShareMessage, ver
  // @/lib/reservationShare) — nunca leídos en ninguna otra parte de este
  // panel.
  is_open: boolean;
  creator_name: string | null;
  // Conteo RAW de reservation_players — nunca incluye al creador cuando es
  // PLAYER autoregistrado (approve_reservation_join_request nunca le crea
  // una fila propia, ver Reservation Editing Principles). El único caller
  // que arma el mensaje (PlayerActivity, siempre con isCreator === true en
  // ese momento) le suma 1 él mismo, el mismo criterio que
  // _reservation_effective_player_count ya usa en SQL.
  reservation_players_count: number;
};

// Shared row shape for the focused-reservation lookup (Reservations page),
// the myReservations (solicitudes) list, and the myBookings (reservas)
// queries below — same select list, same mapping, reused rather than
// duplicated.
export type RawReservationRow = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  court_id: string;
  created_by: string;
  price_amount: number | null;
  price_currency: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  courts: { name: string } | null;
  is_open: boolean;
  profiles: { full_name: string | null } | null;
  reservation_players: Array<{ count: number }> | null;
};

export function toMyReservation(r: RawReservationRow): MyReservation {
  return {
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    status: r.status as MyReservation["status"],
    court_id: r.court_id,
    courtName: r.courts?.name ?? "—",
    created_by: r.created_by,
    price_amount: r.price_amount,
    price_currency: r.price_currency,
    rejection_reason: r.rejection_reason,
    rejected_at: r.rejected_at,
    is_open: r.is_open,
    creator_name: r.profiles?.full_name ?? null,
    reservation_players_count: r.reservation_players?.[0]?.count ?? 0,
  };
}

export interface PlayerReservations {
  // "Mis solicitudes" — only the request lifecycle the PLAYER themselves
  // started (requestReservation always sets created_by to the requester):
  // pending first, then rejected, each group most-recent-first.
  myReservations: MyReservation[];
  // "Mis reservas" — every CONFIRMED reservation the player participates in,
  // however it was created: self-requested-then-approved, or OWNER/ADMIN
  // added them directly via reservation_players.
  myBookings: MyReservation[];
}

// profiles!reservations_created_by_fkey — reservations tiene 3 FKs a
// profiles (created_by, cancelled_by, rejected_by), así que el embed
// necesita el nombre explícito del constraint para no ser ambiguo (mismo
// patrón que profiles!reservation_join_requests_profile_id_fkey en
// reservationJoinRequests.ts). reservation_players(count) es un conteo
// embebido — nunca una fila real — mismo costo que ya paga esta consulta.
const RESERVATION_SELECT =
  "id, date, start_time, duration_minutes, status, court_id, created_by, price_amount, price_currency, rejection_reason, rejected_at, is_open, courts(name), profiles!reservations_created_by_fkey(full_name), reservation_players(count)";

// Fetches both "Mis solicitudes" and "Mis reservas" for one player in one
// club, `todayStr` scoping both to today-forward (the panel never shows
// history). Three independent queries, run in parallel by the caller
// alongside whatever else that page needs — this function itself only
// awaits its own three.
export async function getPlayerReservations(
  supabase: SupabaseClient<Database>,
  clubId: string,
  playerId: string,
  todayStr: string
): Promise<PlayerReservations> {
  const [myReservationsRes, myOwnBookingsRes, myParticipantBookingsRes] = await Promise.all([
    supabase
      .from("reservations")
      .select(RESERVATION_SELECT)
      .eq("club_id", clubId)
      .eq("created_by", playerId)
      .in("status", ["pending", "rejected"])
      .gte("date", todayStr)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("reservations")
      .select(RESERVATION_SELECT)
      .eq("club_id", clubId)
      .eq("created_by", playerId)
      .eq("status", "confirmed")
      .gte("date", todayStr)
      .limit(30),
    supabase
      .from("reservation_players")
      .select(
        `reservations!inner(${RESERVATION_SELECT}, club_id)`
      )
      .eq("profile_id", playerId)
      .eq("reservations.club_id", clubId)
      .eq("reservations.status", "confirmed")
      .gte("reservations.date", todayStr)
      .limit(30),
  ]);

  // Pending first, then rejected — each group keeps the created_at DESC
  // order the query already fetched them in ("más recientes primero").
  const rawMyReservations = ((myReservationsRes.data ?? []) as unknown as RawReservationRow[]).map(toMyReservation);
  const myReservations: MyReservation[] = [
    ...rawMyReservations.filter((r) => r.status === "pending"),
    ...rawMyReservations.filter((r) => r.status === "rejected"),
  ];

  // Merges the two "Mis reservas" sources and dedupes by id (a reservation
  // can only ever match one of the two — created_by and reservation_players
  // participation are never both true for the same row in current flows —
  // but the dedupe is kept as a safe, deterministic fallback rather than
  // assuming that always holds).
  const rawParticipantRows = (myParticipantBookingsRes.data ?? []) as unknown as Array<{
    reservations: RawReservationRow | null;
  }>;
  const bookingsById = new Map<string, MyReservation>();
  for (const row of (myOwnBookingsRes.data ?? []) as unknown as RawReservationRow[]) {
    bookingsById.set(row.id, toMyReservation(row));
  }
  for (const row of rawParticipantRows) {
    if (row.reservations) bookingsById.set(row.reservations.id, toMyReservation(row.reservations));
  }
  const myBookings: MyReservation[] = Array.from(bookingsById.values());

  return { myReservations, myBookings };
}
