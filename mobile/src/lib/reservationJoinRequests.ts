import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de src/lib/reservationJoinRequests.ts (app web) — mismas RPCs
// exactas (set_reservation_open_status, approve_reservation_join_request,
// reject_reservation_join_request, lectura RLS-scoped de
// reservation_join_requests), mismo mapeo de errores. Toda la autorización
// real (creador, OWNER/ADMIN, membresía activa, reserva abierta, tope de 4,
// bloqueo concurrente) vive en las RPCs SECURITY DEFINER — esto solo
// traduce sus códigos a texto en español, igual que la web. La web envuelve
// esto en Server Actions solo por revalidatePath (irrelevante en RN) —
// llamar las RPCs directo desde el cliente RN es exactamente tan seguro.
//
// request_to_join_reservation (PLAYER, "Solicitar unirme") no se porta acá
// — ese flujo es exclusivo de PLAYER y sigue fuera de alcance en mobile
// (ver ReservationDetailScreen.tsx).

export type JoinRequestActionResult = { success?: boolean; error?: string; requestId?: string };

// Idéntico a mapJoinRequestError en la web — los códigos 22023/23505 cubren
// varios mensajes distintos según la RPC, distinguidos por el texto
// original (siempre en inglés, nunca mostrado tal cual al usuario).
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

export async function setReservationOpenStatus(
  supabase: SupabaseClient<Database>,
  reservationId: string,
  isOpen: boolean
): Promise<JoinRequestActionResult> {
  const { error } = await supabase.rpc("set_reservation_open_status", {
    p_reservation_id: reservationId,
    p_is_open: isOpen,
  });

  if (error) return { error: mapJoinRequestError(error, "Error al cambiar el estado de la reserva. Intenta de nuevo.") };
  return { success: true };
}

export async function approveReservationJoinRequest(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<JoinRequestActionResult> {
  const { error } = await supabase.rpc("approve_reservation_join_request", { p_request_id: requestId });
  if (error) return { error: mapJoinRequestError(error, "Error al aprobar la solicitud. Intenta de nuevo.") };
  return { success: true };
}

export async function rejectReservationJoinRequest(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<JoinRequestActionResult> {
  const { error } = await supabase.rpc("reject_reservation_join_request", { p_request_id: requestId });
  if (error) return { error: mapJoinRequestError(error, "Error al rechazar la solicitud. Intenta de nuevo.") };
  return { success: true };
}

// ─── Solicitudes pendientes (para quien puede gestionarlas) ────────────────
// Lectura directa vía RLS (reservation_join_requests_select ya cubre
// exactamente "el propio solicitante, el creador, u OWNER/ADMIN") — sin
// RPC, mismo criterio que el resto de listas RLS-scoped ya portadas.

export type PendingReservationJoinRequest = {
  id: string;
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export async function getPendingReservationJoinRequests(
  supabase: SupabaseClient<Database>,
  reservationId: string
): Promise<PendingReservationJoinRequest[]> {
  // reservation_join_requests tiene dos FKs hacia profiles (profile_id y
  // resolved_by) — el nombre del FK desambigua cuál embebe PostgREST.
  const { data, error } = await supabase
    .from("reservation_join_requests")
    .select("id, profile_id, created_at, profiles!reservation_join_requests_profile_id_fkey(full_name, avatar_url)")
    .eq("reservation_id", reservationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    profile_id: r.profile_id,
    full_name: (r.profiles as { full_name: string | null } | null)?.full_name ?? null,
    avatar_url: (r.profiles as { avatar_url: string | null } | null)?.avatar_url ?? null,
    created_at: r.created_at,
  }));
}
