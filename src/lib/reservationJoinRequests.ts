"use server";

// Reservas Abiertas/Cerradas + solicitudes para unirse — capa de Server
// Actions compartida por TODAS las superficies que tocan este flujo:
// ReservationTicketPanel (OWNER/ADMIN, Agenda), la página compartida
// /[club]/reservations/[reservationId] (creador PLAYER incluido) y
// PlayerActivity (botón "Compartir"). Una sola implementación — nunca una
// copia por superficie — porque toda la autorización real (creador,
// OWNER/ADMIN, membresía activa, reserva abierta, tope de 4, bloqueo
// concurrente) ya vive en las RPCs SECURITY DEFINER
// (20261031000001_reservation_open_join_requests.sql); estas funciones solo
// traducen sus códigos de error a texto en español, exactamente como el
// resto del módulo de reservas ya hace (mapUpdateReservationError, etc.).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type JoinRequestActionResult = { success?: boolean; error?: string; requestId?: string };

// Los códigos 22023/23505 cubren varios mensajes distintos según la RPC —
// se distinguen por el texto original (siempre en inglés, nunca mostrado
// tal cual al usuario) en vez de inventar un código nuevo por caso.
function mapJoinRequestError(error: { code?: string | null; message?: string | null }, fallback: string): string {
  const msg = error.message ?? "";
  switch (error.code) {
    case "42501":
      return "No tienes permiso para esta acción.";
    case "P0002":
      return "No se encontró la reserva o la solicitud.";
    case "P0005":
      return "Este club se encuentra archivado.";
    case "23505":
      return "Ya tienes una solicitud pendiente para esta reserva.";
    case "22023":
      if (msg.includes("own reservation")) return "No puedes solicitar unirte a tu propia reserva.";
      if (msg.includes("Already part") || msg.includes("already part")) return "Ya haces parte de esta reserva.";
      if (msg.includes("no longer accepts") || msg.includes("not open for join requests")) {
        return "Esta reserva ya no acepta solicitudes.";
      }
      if (msg.includes("maximum number of players")) return "Esta reserva ya alcanzó el máximo de jugadores.";
      if (msg.includes("already resolved")) return "Esta solicitud ya fue resuelta.";
      if (msg.includes("modified concurrently")) return "La reserva cambió mientras se procesaba tu acción. Intenta de nuevo.";
      if (msg.includes("confirmed reservation can change")) return "Solo una reserva confirmada puede cambiar entre Abierta y Cerrada.";
      return fallback;
    default:
      return fallback;
  }
}

// Logs the four fields that actually matter for a Supabase/PostgREST error
// (never just the raw error object — see the incident this fixed: a
// PostgrestError's `message`/`name` are non-enumerable own properties
// inherited from the native Error class, and nested inside a plain wrapper
// object like `{ reservationId, error }` it can serialize as `{}` depending
// on the logging pipeline, silently discarding the one piece of
// information — `hint`, almost always the actual fix — that matters most).
// Server-side only (this file is "use server" throughout) — never sent to
// the client, so this never risks exposing anything to the end user; the
// user-facing message stays whatever mapJoinRequestError already returns.
function logSupabaseError(
  context: string,
  extra: Record<string, unknown>,
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }
): void {
  console.error(context, {
    ...extra,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

// ─── request_to_join_reservation ───────────────────────────────────────────
export async function requestToJoinReservation(
  reservationId: string,
  clubSlug: string
): Promise<JoinRequestActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión para solicitar unirte." };

  const { data, error } = await supabase.rpc("request_to_join_reservation", {
    p_reservation_id: reservationId,
  });

  if (error) {
    logSupabaseError("[requestToJoinReservation] failed:", { reservationId }, error);
    return { error: mapJoinRequestError(error, "Error al enviar la solicitud. Intenta de nuevo.") };
  }

  revalidatePath(`/${clubSlug}/reservations/${reservationId}`);
  return { success: true, requestId: data as string };
}

// ─── approve_reservation_join_request ──────────────────────────────────────
export async function approveReservationJoinRequest(
  requestId: string,
  clubSlug: string,
  reservationId: string
): Promise<JoinRequestActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase.rpc("approve_reservation_join_request", { p_request_id: requestId });

  if (error) {
    logSupabaseError("[approveReservationJoinRequest] failed:", { requestId }, error);
    return { error: mapJoinRequestError(error, "Error al aprobar la solicitud. Intenta de nuevo.") };
  }

  revalidatePath(`/${clubSlug}/reservations/${reservationId}`);
  revalidatePath(`/${clubSlug}/admin/reservations`);
  return { success: true };
}

// ─── reject_reservation_join_request ───────────────────────────────────────
export async function rejectReservationJoinRequest(
  requestId: string,
  clubSlug: string,
  reservationId: string
): Promise<JoinRequestActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase.rpc("reject_reservation_join_request", { p_request_id: requestId });

  if (error) {
    logSupabaseError("[rejectReservationJoinRequest] failed:", { requestId }, error);
    return { error: mapJoinRequestError(error, "Error al rechazar la solicitud. Intenta de nuevo.") };
  }

  revalidatePath(`/${clubSlug}/reservations/${reservationId}`);
  revalidatePath(`/${clubSlug}/admin/reservations`);
  return { success: true };
}

// ─── set_reservation_open_status ───────────────────────────────────────────
export async function setReservationOpenStatus(
  reservationId: string,
  clubSlug: string,
  isOpen: boolean
): Promise<JoinRequestActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." };

  const { error } = await supabase.rpc("set_reservation_open_status", {
    p_reservation_id: reservationId,
    p_is_open: isOpen,
  });

  if (error) {
    logSupabaseError("[setReservationOpenStatus] failed:", { reservationId }, error);
    return { error: mapJoinRequestError(error, "Error al cambiar el estado de la reserva. Intenta de nuevo.") };
  }

  revalidatePath(`/${clubSlug}/reservations/${reservationId}`);
  revalidatePath(`/${clubSlug}/admin/reservations`);
  return { success: true };
}

// ─── get_reservation_share_detail ──────────────────────────────────────────
// Toda la info que necesita la página compartida en un solo round-trip
// (ver comentario de la RPC) — devuelve un resultado discriminado en vez de
// null/objeto para que el caller pueda distinguir "no existe" de "no
// autorizado" sin re-adivinar a partir de un error genérico.

export type ReservationSharePlayer = {
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  category: string | null;
};

export type ReservationShareDetail = {
  reservation: {
    id: string;
    status: string;
    is_open: boolean;
    date: string;
    start_time: string;
    duration_minutes: number;
    type: string;
    court_name: string | null;
    created_by: string;
    creator_name: string | null;
    is_creator: boolean;
    // Solo para mostrar "Valor" en el detalle — nunca recalculado acá,
    // exactamente lo que ya persiste reservations.price_amount/currency
    // (ver Reservation Pricing Principles).
    price_amount: number | null;
    price_currency: string | null;
  };
  club: { id: string; name: string; slug: string };
  can_manage: boolean;
  player_count: number;
  players: ReservationSharePlayer[];
  my_request: { id: string; status: string } | null;
  am_participant: boolean;
  has_schedule_conflict: boolean;
};

export type ReservationShareResult =
  | { status: "ok"; detail: ReservationShareDetail }
  | { status: "not_found" }
  | { status: "forbidden" };

export async function getReservationShareDetail(reservationId: string): Promise<ReservationShareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "forbidden" };

  const { data, error } = await supabase.rpc("get_reservation_share_detail", {
    p_reservation_id: reservationId,
  });

  if (error) {
    if (error.code === "P0002") return { status: "not_found" };
    if (error.code === "42501") return { status: "forbidden" };
    logSupabaseError("[getReservationShareDetail] failed:", { reservationId }, error);
    return { status: "not_found" };
  }

  return { status: "ok", detail: data as unknown as ReservationShareDetail };
}

// ─── resolve_reservation_slug ───────────────────────────────────────────────
// Paso previo, solo para el slug corto nuevo "nombre-YYYYMMDDHHmm" (sin
// uuid, ver @/lib/reservationSlug) — resuelve el uuid real antes de poder
// llamar a getReservationShareDetail, que sigue siendo la única puerta de
// autorización/contenido real. Nunca se usa para un uuid puro ni para el
// slug anterior "nombre-fecha-uuid": esos ya traen el uuid en el propio
// texto (extractReservationId), sin necesitar ningún round-trip.
export async function resolveReservationSlugToId(
  clubId: string,
  nameSlug: string,
  date: string,
  startTime: string
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("resolve_reservation_slug", {
    p_club_id: clubId,
    p_name_slug: nameSlug,
    p_date: date,
    p_start_time: startTime,
  });

  if (error) {
    logSupabaseError("[resolveReservationSlugToId] failed:", { clubId, date, startTime }, error);
    return null;
  }

  return data ?? null;
}

// ─── Solicitudes pendientes (para quien puede gestionarlas) ────────────────
// Lectura directa vía RLS (reservation_join_requests_select ya cubre
// exactamente "el propio solicitante, el creador, u OWNER/ADMIN") — sin
// RPC, igual que cualquier otra lista ya scopeda por policy en este
// proyecto. Un viewer sin permiso simplemente ve una lista vacía, nunca un
// error (mismo patrón que el resto de listas RLS-scoped del proyecto).

export type PendingReservationJoinRequest = {
  id: string;
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export async function getPendingReservationJoinRequests(
  reservationId: string
): Promise<PendingReservationJoinRequest[]> {
  const supabase = await createClient();

  // reservation_join_requests has two FKs into profiles (profile_id and
  // resolved_by) — the FK name disambiguates which one PostgREST embeds.
  const { data, error } = await supabase
    .from("reservation_join_requests")
    .select("id, profile_id, created_at, profiles!reservation_join_requests_profile_id_fkey(full_name, avatar_url)")
    .eq("reservation_id", reservationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("[getPendingReservationJoinRequests] failed:", { reservationId }, error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    profile_id: r.profile_id,
    full_name: (r.profiles as { full_name: string | null } | null)?.full_name ?? null,
    avatar_url: (r.profiles as { avatar_url: string | null } | null)?.avatar_url ?? null,
    created_at: r.created_at,
  }));
}
