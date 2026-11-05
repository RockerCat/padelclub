import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  mapPadelVenueAdmin,
  mapPadelVenueAdminList,
  mapPadelVenueList,
  mapVenueDuplicates,
  type PadelVenue,
  type PadelVenueAdmin,
  type PadelVenueStatus,
  type PadelVenueWriteInput,
  type VenueDuplicates,
} from "./venues";

// Único punto de acceso a los RPCs del directorio de establecimientos
// (20261117000001_padel_venues_directory.sql). Todos devuelven jsonb, así
// que el mapeo a tipos propios ocurre aquí, una sola vez. Mismo cast
// acotado "rpc por nombre" que shared/openMatches/api.ts: compila antes de
// regenerar shared/types/database.ts y sigue siendo correcto después.

type RpcError = { message: string; code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type RpcByName = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

function rpc(client: SupabaseClient<Database>, fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult> {
  return (client as unknown as RpcByName).rpc(fn, args);
}

export type VenueResult<T> = { data: T; error: null } | { data: null; error: { message: string; code?: string } };

const fail = (error: { message: string; code?: string }) => ({ data: null, error }) as const;

// ─── Público (anon + authenticated) ─────────────────────────────────────

export interface PadelVenueFilters {
  query?: string | null;
  department?: string | null;
  municipality?: string | null;
  limit?: number;
}

export async function listPadelVenues(
  client: SupabaseClient<Database>,
  filters: PadelVenueFilters = {}
): Promise<VenueResult<PadelVenue[]>> {
  const { data, error } = await rpc(client, "list_padel_venues", {
    p_query: filters.query || null,
    p_department: filters.department || null,
    p_municipality: filters.municipality || null,
    p_limit: filters.limit ?? 300,
  });
  if (error) return fail(error);
  return { data: mapPadelVenueList(data), error: null };
}

// ─── SUPERADMIN ─────────────────────────────────────────────────────────

export async function platformListPadelVenues(client: SupabaseClient<Database>): Promise<VenueResult<PadelVenueAdmin[]>> {
  const { data, error } = await rpc(client, "platform_list_padel_venues");
  if (error) return fail(error);
  return { data: mapPadelVenueAdminList(data), error: null };
}

/** data = null cuando no existe. */
export async function platformGetPadelVenue(
  client: SupabaseClient<Database>,
  venueId: string
): Promise<VenueResult<PadelVenueAdmin | null>> {
  const { data, error } = await rpc(client, "platform_get_padel_venue", { p_venue_id: venueId });
  if (error) return fail(error);
  return { data: mapPadelVenueAdmin(data), error: null };
}

export async function platformFindVenueDuplicates(
  client: SupabaseClient<Database>,
  input: { name: string; department: string; municipality: string; address?: string | null; phone?: string | null; whatsapp?: string | null; excludeId?: string | null }
): Promise<VenueResult<VenueDuplicates>> {
  const { data, error } = await rpc(client, "platform_find_padel_venue_duplicates", {
    p_name: input.name,
    p_department: input.department,
    p_municipality: input.municipality,
    p_address: input.address ?? null,
    p_phone: input.phone ?? null,
    p_whatsapp: input.whatsapp ?? null,
    p_exclude_id: input.excludeId ?? null,
  });
  if (error) return fail(error);
  return { data: mapVenueDuplicates(data), error: null };
}

async function admin(client: SupabaseClient<Database>, fn: string, args: Record<string, unknown>): Promise<VenueResult<PadelVenueAdmin>> {
  const { data, error } = await rpc(client, fn, args);
  if (error) return fail(error);
  const venue = mapPadelVenueAdmin(data);
  return venue ? { data: venue, error: null } : fail({ message: "venue_not_found" });
}

export function platformSavePadelVenue(
  client: SupabaseClient<Database>,
  venueId: string | null,
  input: PadelVenueWriteInput
): Promise<VenueResult<PadelVenueAdmin>> {
  return admin(client, "platform_save_padel_venue", {
    p_venue_id: venueId,
    p_name: input.name,
    p_department: input.department,
    p_municipality: input.municipality,
    p_address: input.address,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_maps_url: input.mapsUrl,
    p_phone: input.phone,
    p_whatsapp: input.whatsapp,
    p_source_label: input.sourceLabel,
    p_source_url: input.sourceUrl,
    p_verified_at: input.verifiedAt,
    p_internal_notes: input.internalNotes,
  });
}

export const platformSetPadelVenueStatus = (c: SupabaseClient<Database>, venueId: string, status: PadelVenueStatus) =>
  admin(c, "platform_set_padel_venue_status", { p_venue_id: venueId, p_status: status });

export const platformLinkPadelVenueClub = (c: SupabaseClient<Database>, venueId: string, clubId: string | null) =>
  admin(c, "platform_link_padel_venue_club", { p_venue_id: venueId, p_club_id: clubId });

export async function platformConvertPadelVenueToPendingClub(
  client: SupabaseClient<Database>,
  venueId: string,
  input: { name: string; slug: string; visibility: "public" | "private" }
): Promise<VenueResult<{ id: string; slug: string }>> {
  const { data, error } = await rpc(client, "platform_convert_padel_venue_to_pending_club", {
    p_venue_id: venueId,
    p_name: input.name,
    p_slug: input.slug,
    p_visibility: input.visibility,
  });
  if (error) return fail(error);
  const r = (data ?? {}) as { id?: unknown; slug?: unknown };
  if (typeof r.id !== "string" || typeof r.slug !== "string") return fail({ message: "venue_not_found" });
  return { data: { id: r.id, slug: r.slug }, error: null };
}

export async function platformDeletePadelVenueDraft(client: SupabaseClient<Database>, venueId: string): Promise<VenueResult<true>> {
  const { error } = await rpc(client, "platform_delete_padel_venue_draft", { p_venue_id: venueId });
  if (error) return fail(error);
  return { data: true, error: null };
}
