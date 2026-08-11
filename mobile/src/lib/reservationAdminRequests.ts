import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { validateRejectionInput } from "./reservationRejection";

// Portado de las queries de "Solicitudes pendientes"/"Reservas rechazadas"
// en page.tsx, y de approvePendingReservation/rejectPendingReservation en
// actions.ts (app web, src/app/(app)/[club]/admin/reservations/) — mismas
// RPCs exactas (expire_pending_reservations, approve_pending_reservation,
// resolve_reservation_request_notifications, notify_reservation_approved,
// notify_reservation_rejected), mismo update directo con guard
// .eq("status", "pending") para rechazar, mismo catálogo de motivos
// (shared/reservations/rejection.ts vía ./reservationRejection), mismos
// mensajes de error. La web envuelve todo esto en Server Actions solo por
// requireAdminRole/revalidatePath (irrelevante en RN) — la autorización
// real vive en las RPCs y en RLS, igual que el resto de este módulo en
// mobile.

export type PendingRequest = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  court_id: string;
  courtName: string;
  playerId: string | null;
  playerName: string | null;
  price_amount: number | null;
  price_currency: string | null;
  is_open: boolean;
  playerCount: number;
};

export type RejectedReservation = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  courtName: string;
  playerName: string | null;
  price_amount: number | null;
  price_currency: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  rejectedByName: string | null;
};

type RawPending = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  court_id: string;
  created_by: string;
  price_amount: number | null;
  price_currency: string | null;
  is_open: boolean;
  reservation_players: Array<{ profile_id: string }>;
  courts: { name: string } | null;
};

type RawRejected = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  court_id: string;
  created_by: string;
  price_amount: number | null;
  price_currency: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  courts: { name: string } | null;
};

// Resuelve, de forma perezosa, cualquier solicitud 'pending' de este club
// cuyo horario ya pasó — antes de las consultas de abajo, igual que
// page.tsx (app web) hace antes de renderizar Agenda/Solicitudes.
export async function getAdminReservationRequests(
  supabase: SupabaseClient<Database>,
  clubId: string,
  todayStr: string
): Promise<{ pending: PendingRequest[]; rejected: RejectedReservation[] }> {
  await supabase.rpc("expire_pending_reservations", { p_club_id: clubId });

  const [pendingRes, rejectedRes] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "id, date, start_time, duration_minutes, court_id, created_by, price_amount, price_currency, is_open, reservation_players(profile_id), courts(name)"
      )
      .eq("club_id", clubId)
      .eq("status", "pending")
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true }),
    // Últimas 100, más recientes primero — mismo límite que page.tsx; el
    // filtro de periodo (30/90 días/todo) se aplica client-side sobre este
    // mismo conjunto, sin una consulta adicional por cambio de filtro.
    supabase
      .from("reservations")
      .select(
        "id, date, start_time, duration_minutes, court_id, created_by, price_amount, price_currency, rejection_reason, rejected_at, rejected_by, courts(name)"
      )
      .eq("club_id", clubId)
      .eq("status", "rejected")
      .order("rejected_at", { ascending: false })
      .limit(100),
  ]);

  const rawPending = (pendingRes.data ?? []) as unknown as RawPending[];
  const rawRejected = (rejectedRes.data ?? []) as unknown as RawRejected[];

  // Un solo fetch de perfiles cubre a todos los solicitantes/rechazados/
  // administradores que rechazaron — nunca N+1.
  const profileIds = [
    ...new Set([
      ...rawPending.map((r) => r.created_by),
      ...rawRejected.map((r) => r.created_by),
      ...rawRejected.map((r) => r.rejected_by).filter((id): id is string => !!id),
    ]),
  ];
  const profilesData =
    profileIds.length > 0
      ? ((await supabase.from("profiles").select("id, full_name").in("id", profileIds)).data ?? [])
      : [];
  const profileMap = new Map(
    (profilesData as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name])
  );

  const pending: PendingRequest[] = rawPending.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    court_id: r.court_id,
    courtName: r.courts?.name ?? "—",
    playerId: r.created_by,
    playerName: profileMap.get(r.created_by) ?? null,
    price_amount: r.price_amount,
    price_currency: r.price_currency,
    is_open: r.is_open,
    // Fallback a 1 (el propio solicitante) — mismo criterio que
    // getReservationForEdit/PendingRequestsSection en la web: una solicitud
    // pendiente siempre la crea un PLAYER, nunca OWNER/ADMIN.
    playerCount: r.reservation_players.length > 0 ? r.reservation_players.length : 1,
  }));

  const rejected: RejectedReservation[] = rawRejected.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    courtName: r.courts?.name ?? "—",
    playerName: profileMap.get(r.created_by) ?? null,
    price_amount: r.price_amount,
    price_currency: r.price_currency,
    rejection_reason: r.rejection_reason,
    rejected_at: r.rejected_at,
    rejectedByName: r.rejected_by ? (profileMap.get(r.rejected_by) ?? null) : null,
  }));

  return { pending, rejected };
}

export type PendingActionResult = { success?: boolean; error?: string };

// Idéntico a mapApprovePendingReservationError en actions.ts (app web).
function mapApprovePendingReservationError(error: { code?: string | null; message?: string }): string {
  switch (error.code) {
    case "P0002":
      return "Solicitud no encontrada.";
    case "P0004":
      return "La cancha ya no está disponible.";
    case "P0005":
      return "Este club se encuentra archivado.";
    case "P0003":
      return error.message || "El horario ya no es válido para este club.";
    case "23P01":
      return "El horario fue confirmado para otra reserva.";
    case "22023":
      return "La solicitud ya fue procesada.";
    case "42501":
      return "Sin permiso.";
    default:
      return "Error al confirmar la reserva. Intenta nuevamente.";
  }
}

export async function approvePendingReservation(
  supabase: SupabaseClient<Database>,
  reservationId: string
): Promise<PendingActionResult> {
  const { error } = await supabase.rpc("approve_pending_reservation", { p_reservation_id: reservationId });
  if (error) return { error: mapApprovePendingReservationError(error) };

  // Best-effort, mismo orden y misma convención que la web: la reserva ya
  // quedó confirmada y nunca se revierte por un fallo de notificación.
  await supabase.rpc("resolve_reservation_request_notifications", {
    p_reservation_id: reservationId,
    p_status: "approved",
  });
  await supabase.rpc("notify_reservation_approved", { p_reservation_id: reservationId });

  return { success: true };
}

export async function rejectPendingReservation(
  supabase: SupabaseClient<Database>,
  clubId: string,
  reservationId: string,
  reasonCode: string,
  reasonComment: string
): Promise<PendingActionResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sin permiso." };

  const { data: res } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .single();

  if (!res) return { error: "Solicitud no encontrada." };
  if (res.status !== "pending") return { error: "La solicitud ya fue procesada." };

  // Nunca se confía en un motivo/comentario compuesto en el cliente — se
  // revalida el código y el largo acá, igual que la web.
  const validated = validateRejectionInput(reasonCode, reasonComment);
  if ("error" in validated) return { error: validated.error };

  // .eq("status", "pending") es el punto de decisión atómico — misma
  // protección de concurrencia que la web.
  const { data: updated, error: updateErr } = await supabase
    .from("reservations")
    .update({
      status: "rejected",
      rejection_reason_code: validated.reasonCode,
      rejection_reason: validated.reasonText,
      rejected_by: user.id,
      rejected_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateErr) return { error: "Error al rechazar la solicitud. Intenta nuevamente." };
  if (!updated) return { error: "La solicitud ya fue procesada." };

  // Best-effort, misma convención que notify_reservation_rejected en la web.
  await supabase.rpc("notify_reservation_rejected", { p_reservation_id: reservationId });

  return { success: true };
}
