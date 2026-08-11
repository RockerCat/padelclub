import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Fuente única de verdad para la actividad de reservas propias de un
// jugador — "Mis solicitudes" (myReservations) y "Mis reservas"
// (myBookings). Portado de src/lib/playerReservations.ts (app web),
// reutilizado por la página de Reservas y la home del jugador en WEB, y
// por mobile por igual — ninguno de los tres puede divergir en las
// queries o en el orden.

export type MyReservation = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  status: "pending" | "confirmed" | "cancelled" | "rejected" | "expired";
  court_id: string;
  courtName: string;
  // Quién la creó — ser participante en reservation_players nunca otorga
  // permiso de edición, solo el creador lo tiene. Necesario aquí (en vez
  // de re-derivarlo por tarjeta) porque myBookings mezcla filas
  // auto-solicitadas y agregadas como participante por OWNER/ADMIN, que
  // lucen idénticas de otro modo.
  created_by: string;
  // Congelado al momento de la solicitud (ver requestReservation) — null
  // para reservas anteriores al motor de tarifas, o cuando ninguna tarifa
  // aplicó. Nunca un recálculo en vivo: es exactamente lo que se cobró al
  // solicitar.
  price_amount: number | null;
  price_currency: string | null;
  // Solo se define una vez status === "rejected" — mismo texto y
  // timestamp que ve OWNER/ADMIN, nunca un segundo mensaje distinto.
  rejection_reason: string | null;
  rejected_at: string | null;
  // Solo para el mensaje de "WhatsApp" (buildReservationShareMessage, ver
  // ./share.ts) — nunca leídos en ninguna otra parte de este panel.
  is_open: boolean;
  creator_name: string | null;
  // Conteo RAW de reservation_players — nunca incluye al creador cuando es
  // PLAYER autoregistrado (approve_reservation_join_request nunca le crea
  // una fila propia). El único caller que arma el mensaje (siempre con
  // isCreator === true en ese momento) le suma 1 él mismo, el mismo
  // criterio que _reservation_effective_player_count ya usa en SQL.
  reservation_players_count: number;
};

// Forma de fila compartida para el lookup de una reserva puntual, la
// lista myReservations (solicitudes) y las queries myBookings (reservas)
// de abajo — mismo select, mismo mapeo, reutilizado en vez de duplicado.
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
  // "Mis solicitudes" — solo el ciclo de vida de solicitud que el propio
  // PLAYER inició (requestReservation siempre fija created_by al
  // solicitante): pending primero, luego expired, luego rejected, cada
  // grupo más-reciente-primero.
  myReservations: MyReservation[];
  // "Mis reservas" — toda reserva CONFIRMED en la que el jugador
  // participa, sin importar cómo se creó: auto-solicitada-y-luego-aprobada,
  // o agregado directamente por OWNER/ADMIN vía reservation_players.
  myBookings: MyReservation[];
}

// profiles!reservations_created_by_fkey — reservations tiene 3 FKs a
// profiles (created_by, cancelled_by, rejected_by), así que el embed
// necesita el nombre explícito del constraint para no ser ambiguo.
// reservation_players(count) es un conteo embebido — nunca una fila real.
const RESERVATION_SELECT =
  "id, date, start_time, duration_minutes, status, court_id, created_by, price_amount, price_currency, rejection_reason, rejected_at, is_open, courts(name), profiles!reservations_created_by_fkey(full_name), reservation_players(count)";

// Trae tanto "Mis solicitudes" como "Mis reservas" para un jugador en un
// club, `todayStr` acota ambas desde hoy en adelante (el panel nunca
// muestra historial). Tres queries independientes, ejecutadas en paralelo
// por el caller junto con lo que esa pantalla más necesite — esta función
// solo espera las suyas.
export async function getPlayerReservations(
  supabase: SupabaseClient<Database>,
  clubId: string,
  playerId: string,
  todayStr: string
): Promise<PlayerReservations> {
  // Resuelve, de forma perezosa, cualquier solicitud 'pending' de este
  // club cuyo horario ya pasó (nunca fue aprobada ni rechazada) — la
  // misma función SQL centralizada que approve_pending_reservation/
  // get_reservation_share_detail ya llaman, para que "Mis solicitudes"
  // nunca muestre una 'pending' obsoleta como si aún pudiera resolverse.
  await supabase.rpc("expire_pending_reservations", { p_club_id: clubId });

  const [myReservationsRes, myOwnBookingsRes, myParticipantBookingsRes] = await Promise.all([
    supabase
      .from("reservations")
      .select(RESERVATION_SELECT)
      .eq("club_id", clubId)
      .eq("created_by", playerId)
      .in("status", ["pending", "rejected", "expired"])
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
      .select(`reservations!inner(${RESERVATION_SELECT}, club_id)`)
      .eq("profile_id", playerId)
      .eq("reservations.club_id", clubId)
      .eq("reservations.status", "confirmed")
      .gte("reservations.date", todayStr)
      .limit(30),
  ]);

  // Pending primero, luego expired, luego rejected — cada grupo conserva
  // el orden created_at DESC que la consulta ya trajo.
  const rawMyReservations = ((myReservationsRes.data ?? []) as unknown as RawReservationRow[]).map(toMyReservation);
  const myReservations: MyReservation[] = [
    ...rawMyReservations.filter((r) => r.status === "pending"),
    ...rawMyReservations.filter((r) => r.status === "expired"),
    ...rawMyReservations.filter((r) => r.status === "rejected"),
  ];

  // Combina las dos fuentes de "Mis reservas" y deduplica por id (una
  // reserva solo puede matchear una de las dos — created_by y
  // participación en reservation_players nunca son ambas true para la
  // misma fila en los flujos actuales — pero el dedupe se mantiene como
  // fallback seguro y determinista).
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

// Detalle por id — reutiliza el mismo RESERVATION_SELECT, para deep-link
// directo a la pantalla de detalle (p. ej. tras restaurar sesión) sin
// depender de que el listado ya esté en memoria. Nunca valida pertenencia
// al jugador aquí: RLS en `reservations` ya es la autoridad real.
export async function getReservationById(
  supabase: SupabaseClient<Database>,
  reservationId: string
): Promise<MyReservation | null> {
  const { data } = await supabase.from("reservations").select(RESERVATION_SELECT).eq("id", reservationId).maybeSingle();

  if (!data) return null;
  return toMyReservation(data as unknown as RawReservationRow);
}
