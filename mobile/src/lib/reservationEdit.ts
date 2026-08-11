import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { getAvailableSlots } from "../../../shared/reservations/availability";

export type { AvailableSlotsResult } from "../../../shared/reservations/availability";

// getAvailableSlotsAdmin ya NO tiene su propia implementación — llama
// directo a shared/reservations/availability.ts::getAvailableSlots, la
// misma función que la Server Action getAvailableSlots (app web) también
// llama. Antes WEB y mobile tenían dos copias independientes de este
// algoritmo (el bug de timezone real que motivó esta migración: ver
// CLAUDE.md) — ahora es una sola implementación, sin el wrapper
// requireAdminRole de la web (RLS ya es la autoridad real, igual que el
// resto de queries portadas de este proyecto).
export async function getAvailableSlotsAdmin(
  supabase: SupabaseClient<Database>,
  clubId: string,
  courtId: string,
  date: string,
  durationMinutes: number,
  excludeReservationId?: string
) {
  return getAvailableSlots(supabase, clubId, courtId, date, durationMinutes, excludeReservationId);
}

// getReservationForEditAdmin se queda tal cual (no centralizada): trae un
// subconjunto deliberadamente más chico de columnas que
// getReservationForEdit en la web (que además incluye price/extra-time/
// origen/is_open — usados por el panel de ticket de Agenda, mucho más
// grande que el modal de edición de mobile). Forzar una sola función
// compartida acá infla la query de mobile sin necesidad, o exige un
// parámetro de selección de columnas — complejidad que esta pasada de
// shared/ no justifica (ver reporte).

export type ReservationEditData = {
  court_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  title: string | null;
  notes: string | null;
  player_ids: string[];
};

export async function getReservationForEditAdmin(
  supabase: SupabaseClient<Database>,
  reservationId: string
): Promise<ReservationEditData | null> {
  const { data } = await supabase
    .from("reservations")
    .select("court_id, date, start_time, duration_minutes, type, title, notes, status, reservation_players(profile_id)")
    .eq("id", reservationId)
    .single();

  if (!data || data.status === "cancelled" || data.status === "rejected") return null;

  const playerIds = (data.reservation_players as unknown as Array<{ profile_id: string }>).map((rp) => rp.profile_id);

  return {
    court_id: data.court_id,
    date: data.date,
    start_time: data.start_time,
    duration_minutes: data.duration_minutes,
    type: data.type,
    title: data.title ?? null,
    notes: data.notes ?? null,
    player_ids: playerIds,
  };
}

// getReservationTicketDetail — contraparte más rica de
// getReservationForEditAdmin, usada solo por el nuevo ReservationTicketPanel
// (Agenda: tocar un slot ocupado confirmado). Portado del subconjunto que
// necesita ese panel de getReservationForEdit en actions.ts (app web):
// precio, origen (creador/¿es PLAYER?), tiempo extra, is_open/closed_reason
// y cupo. No se centraliza en shared/ por el mismo motivo que
// ReservationEditData arriba (comentario original): es un select
// deliberadamente más grande que el de edición, específico de esta vista
// de detalle.
export type ReservationTicketDetail = {
  court_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  title: string | null;
  notes: string | null;
  player_ids: string[];
  price_amount: number | null;
  price_currency: string | null;
  created_by: string;
  creator_name: string | null;
  creator_is_player: boolean;
  extra_minutes: number;
  extra_amount: number;
  extra_currency: string | null;
  is_open: boolean;
  closed_reason: string | null;
  player_count: number;
};

export async function getReservationTicketDetail(
  supabase: SupabaseClient<Database>,
  clubId: string,
  reservationId: string
): Promise<ReservationTicketDetail | null> {
  const { data } = await supabase
    .from("reservations")
    .select(
      "court_id, date, start_time, duration_minutes, type, title, notes, status, created_by, price_amount, price_currency, extra_minutes, extra_amount, extra_currency, is_open, closed_reason, reservation_players(profile_id)"
    )
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .single();

  if (!data || data.status === "cancelled" || data.status === "rejected") return null;

  const [{ data: creatorProfile }, { data: creatorMembership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", data.created_by).maybeSingle(),
    supabase.from("club_members").select("role").eq("club_id", clubId).eq("profile_id", data.created_by).maybeSingle(),
  ]);

  const playerIds = (data.reservation_players as unknown as Array<{ profile_id: string }>).map((rp) => rp.profile_id);
  const creatorIsPlayer = creatorMembership?.role === "PLAYER";

  return {
    court_id: data.court_id,
    date: data.date,
    start_time: data.start_time,
    duration_minutes: data.duration_minutes,
    type: data.type,
    title: data.title ?? null,
    notes: data.notes ?? null,
    player_ids: playerIds,
    price_amount: data.price_amount,
    price_currency: data.price_currency,
    created_by: data.created_by,
    creator_name: creatorProfile?.full_name ?? null,
    creator_is_player: creatorIsPlayer,
    extra_minutes: data.extra_minutes,
    extra_amount: data.extra_amount,
    extra_currency: data.extra_currency,
    is_open: data.is_open,
    closed_reason: data.closed_reason,
    // Mismo fallback que _reservation_effective_player_count en SQL: 1
    // (el propio creador) cuando no hay reservation_players y el creador es
    // PLAYER (reserva nacida de una solicitud aprobada).
    player_count: playerIds.length > 0 ? playerIds.length : creatorIsPlayer ? 1 : 0,
  };
}
