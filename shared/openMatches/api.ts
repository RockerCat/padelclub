import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  mapOpenMatch,
  mapOpenMatchCities,
  mapOpenMatchList,
  type OpenMatch,
  type OpenMatchCity,
} from "./openMatches";

// Único punto de acceso a los RPCs de "Encuentra tu partido".
//
// Todos devuelven jsonb (nunca RETURNS TABLE, ver la migración
// 20261116000001_open_matches.sql), así que el tipo generado de cada uno
// sería `Json` de todos modos: el mapeo a tipos propios ocurre aquí, una
// sola vez. El cast a un cliente "rpc por nombre" es deliberado y está
// acotado a este archivo — permite compilar antes de regenerar
// shared/types/database.ts (que nunca se edita a mano) y sigue siendo
// correcto después, sin cambios.

type RpcError = { message: string; code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type RpcByName = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

function rpc(client: SupabaseClient<Database>, fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult> {
  return (client as unknown as RpcByName).rpc(fn, args);
}

export type OpenMatchResult<T> = { data: T; error: null } | { data: null; error: { message: string; code?: string } };

function fail(error: { message: string; code?: string }): { data: null; error: { message: string; code?: string } } {
  return { data: null, error };
}

export interface OpenMatchFilters {
  city?: string | null;
  date?: string | null;
  level?: string | null;
  minSpots?: number;
}

export async function listOpenMatches(
  client: SupabaseClient<Database>,
  filters: OpenMatchFilters
): Promise<OpenMatchResult<OpenMatch[]>> {
  const { data, error } = await rpc(client, "list_open_matches", {
    p_city: filters.city || null,
    p_date: filters.date || null,
    p_level: filters.level || null,
    p_min_spots: filters.minSpots ?? 1,
  });
  if (error) return fail(error);
  return { data: mapOpenMatchList(data), error: null };
}

export async function listOpenMatchCities(client: SupabaseClient<Database>): Promise<OpenMatchCity[]> {
  const { data, error } = await rpc(client, "list_open_match_cities");
  // Las sugerencias son opcionales: un fallo nunca bloquea la búsqueda.
  if (error) return [];
  return mapOpenMatchCities(data);
}

/** data = null cuando el partido no existe. */
export async function getOpenMatch(
  client: SupabaseClient<Database>,
  matchId: string
): Promise<OpenMatchResult<OpenMatch | null>> {
  const { data, error } = await rpc(client, "get_open_match", { p_match_id: matchId });
  if (error) return fail(error);
  return { data: mapOpenMatch(data), error: null };
}

export async function listMyOpenMatches(client: SupabaseClient<Database>): Promise<OpenMatchResult<OpenMatch[]>> {
  const { data, error } = await rpc(client, "list_my_open_matches");
  if (error) return fail(error);
  return { data: mapOpenMatchList(data), error: null };
}

export interface OpenMatchWriteInput {
  city: string;
  matchDate: string;
  startTime: string;
  level: string;
  venueName: string | null;
  /** Establecimiento del directorio; el servidor exige que esté en la ciudad del partido. */
  venueId: string | null;
  /**
   * Solo al editar: quitar el establecimiento actual. Omitir venueId NUNCA lo
   * quita (el servidor conserva el actual); quitarlo es siempre explícito.
   */
  clearVenue?: boolean;
  comment: string | null;
  courtBooked: boolean;
}

// p_venue_id solo viaja cuando hay establecimiento: omitirlo equivale a
// NULL (DEFAULT en SQL) y mantiene compatible este cliente con una base
// donde 20261117000001 aún no está aplicada (crear/editar sin lugar del
// directorio sigue funcionando con la firma anterior).
function venueArg(venueId: string | null): { p_venue_id?: string } {
  return venueId ? { p_venue_id: venueId } : {};
}

export async function createOpenMatch(
  client: SupabaseClient<Database>,
  input: OpenMatchWriteInput & { playersAlready: number }
): Promise<OpenMatchResult<string>> {
  const { data, error } = await rpc(client, "create_open_match", {
    p_city: input.city,
    p_match_date: input.matchDate,
    p_start_time: input.startTime,
    p_level: input.level,
    p_players_already: input.playersAlready,
    p_venue_name: input.venueName,
    p_comment: input.comment,
    p_court_booked: input.courtBooked,
    ...venueArg(input.venueId),
  });
  if (error) return fail(error);
  return { data: String(data), error: null };
}

async function mutate(
  client: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>
): Promise<OpenMatchResult<OpenMatch>> {
  const { data, error } = await rpc(client, fn, args);
  if (error) return fail(error);
  const match = mapOpenMatch(data);
  return match ? { data: match, error: null } : fail({ message: "match_not_found" });
}

export const joinOpenMatch = (c: SupabaseClient<Database>, id: string) => mutate(c, "join_open_match", { p_match_id: id });
export const leaveOpenMatch = (c: SupabaseClient<Database>, id: string) => mutate(c, "leave_open_match", { p_match_id: id });
export const cancelOpenMatch = (c: SupabaseClient<Database>, id: string) => mutate(c, "cancel_open_match", { p_match_id: id });
export const confirmOpenMatchAttendance = (c: SupabaseClient<Database>, id: string) =>
  mutate(c, "confirm_open_match_attendance", { p_match_id: id });
export const setOpenMatchGuests = (c: SupabaseClient<Database>, id: string, guestCount: number) =>
  mutate(c, "set_open_match_guests", { p_match_id: id, p_guest_count: guestCount });

export function updateOpenMatch(
  client: SupabaseClient<Database>,
  id: string,
  input: OpenMatchWriteInput
): Promise<OpenMatchResult<OpenMatch>> {
  return mutate(client, "update_open_match", {
    ...(input.clearVenue && !input.venueId ? { p_clear_venue: true } : {}),
    p_match_id: id,
    p_city: input.city,
    p_match_date: input.matchDate,
    p_start_time: input.startTime,
    p_level: input.level,
    p_venue_name: input.venueName,
    p_comment: input.comment,
    p_court_booked: input.courtBooked,
    ...venueArg(input.venueId),
  });
}
