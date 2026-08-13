"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveReservationPrice } from "@/lib/reservationPricing";
import type { ResolveReservationPriceResult } from "@/lib/reservationPricing";
import { mapUpdateReservationError } from "@/lib/reservationErrors";

export type RequestFormState = { error?: string; success?: boolean };

export type CancelReservationResult = { success?: boolean; error?: string };

// ─── getReservationPriceQuote ─────────────────────────────────────────────────
// Read-only Server Action — same pattern as getAvailableSlots (admin/
// reservations/actions.ts): called directly from the client component like a
// normal async function, no API route, no service role exposed to the
// browser. The client never reconstructs day-of-week/franja/priority/price
// math itself — this just forwards to the one calculation engine
// (resolveReservationPrice) using the caller's own RLS-scoped session, so an
// unauthenticated or non-member caller naturally gets zero rows back
// (club_pricing_rules_select_member), never a price.
export async function getReservationPriceQuote(
  clubId: string,
  courtId: string,
  date: string,
  startTime: string,
  durationMinutes: number
): Promise<ResolveReservationPriceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      matched: false,
      reason: "missing_pricing_rule",
      ruleId: null,
      ruleName: null,
      durationMinutes,
      priceAmount: null,
      finalPrice: null,
      currency: null,
      calculatedAt: new Date().toISOString(),
    };
  }

  return resolveReservationPrice(supabase, { clubId, courtId, date, startTime, durationMinutes });
}

// Routed through create_reservation_player (Phase 7 concurrency fix,
// 20260814000001) — the direct validate-then-insert this action used to
// perform is gone; every rule (membership, court, operating hours,
// duration, conflict, pricing) is re-validated inside the RPC, inside the
// same advisory-lock-protected transaction update_reservation and
// create_reservation_admin also use, so a reservation created here can
// never race a concurrent edit or admin-created reservation for the same
// court/day. Client-visible behavior is unchanged: same required fields,
// same "no tariff configured" block, same success/notify shape.
export async function requestReservation(
  clubId: string,
  _prevState: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const courtId = formData.get("court_id") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string, 10);
  // Checkbox convention: present = checked, absent = unchecked.
  const isOpen = formData.get("is_open") != null;

  if (!courtId || !date || !startTime) {
    return { error: "Datos incompletos." };
  }

  const { data: reservationId, error } = await supabase.rpc("create_reservation_player", {
    p_club_id: clubId,
    p_court_id: courtId,
    p_date: date,
    p_start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
    p_duration_minutes: durationMinutes,
    p_is_open: isOpen,
  });

  if (error) {
    console.error("[requestReservation] create_reservation_player failed:", { clubId, supabaseError: error });
    return { error: mapUpdateReservationError(error) };
  }

  const { error: notifyError } = await supabase.rpc("notify_reservation_request_created", {
    p_reservation_id: reservationId,
  });
  // Notifying admins is best-effort — the reservation request itself already
  // succeeded and must not be rolled back, and the player must never see a
  // false failure, over a notification-only error. Logged with enough
  // context to diagnose (reservation/club ids, Postgrest error code) without
  // including player-identifying data.
  if (notifyError) {
    console.error("[requestReservation] notify_reservation_request_created RPC failed", {
      reservationId,
      userId: user.id,
      clubId,
      code: notifyError.code,
      message: notifyError.message,
    });
  }

  return { success: true };
}

// ─── cancelMyReservation ───────────────────────────────────────────────────
// PLAYER self-cancellation — creator or participant, only while the
// reservation's start time is still 2+ hours away. Everything that actually
// matters for authorization is re-derived server-side, inside
// cancel_reservation (SECURITY DEFINER), from auth.uid() and the
// reservation row itself; this action passes nothing but the reservation
// id and never trusts client-side timing. clubSlug is only used for the
// revalidatePath calls below, exactly like the existing OWNER/ADMIN
// cancelReservation action uses its own clubSlug for its redirect.
export async function cancelMyReservation(
  reservationId: string,
  clubSlug: string
): Promise<CancelReservationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión para cancelar tu reserva." };

  const { error } = await supabase.rpc("cancel_reservation", { p_reservation_id: reservationId });

  if (error) {
    if (error.code === "23514") return { error: "No puedes cancelar con menos de 2 horas de anticipación." };
    if (error.code === "22023") return { error: "Esta reserva ya no se puede cancelar." };
    if (error.code === "P0002") return { error: "Reserva no encontrada." };
    if (error.code === "42501") return { error: "No tienes permiso para cancelar esta reserva." };
    console.error("[cancelMyReservation] cancel_reservation failed:", { reservationId, supabaseError: error });
    return { error: "Error al cancelar la reserva. Intenta nuevamente." };
  }

  // Best-effort, same pattern as requestReservation's notify call above —
  // the cancellation itself already succeeded and must not be rolled back
  // over a notification-only failure.
  const { error: notifyError } = await supabase.rpc("notify_reservation_cancelled", {
    p_reservation_id: reservationId,
  });
  if (notifyError) {
    console.error("[cancelMyReservation] notify_reservation_cancelled RPC failed", {
      reservationId,
      userId: user.id,
      code: notifyError.code,
      message: notifyError.message,
    });
  }

  revalidatePath(`/${clubSlug}/reservations`);
  revalidatePath(`/${clubSlug}/home`);
  // El Dashboard deportivo del PLAYER (ver CLAUDE.md → Player Dashboard
  // Principles) también depende de esta reserva para "Próxima actividad" —
  // sin esto, el Router Cache de Next.js podía seguir sirviendo esa
  // pantalla con la reserva ya cancelada hasta que expirara solo.
  revalidatePath(`/${clubSlug}/dashboard`);
  return { success: true };
}

// ─── updateMyReservation ───────────────────────────────────────────────────
// PLAYER self-edit — creator only (being a participant grants no edit
// permission), pending/confirmed, not a block, only while the CURRENT
// start time is still 2+ hours away. Every one of those checks, plus
// availability/operating-hours/duration re-validation and price
// recomputation, happens inside update_reservation (SECURITY DEFINER);
// this action passes only the reservation id and the new field values —
// never a role, a computed price, or a bypass flag. Bound into the same
// RequestModal used for creating a reservation (see
// PlayerAvailabilityCalendar.tsx), so the (prevState, formData) shape
// matches requestReservation's exactly.
export async function updateMyReservation(
  reservationId: string,
  clubSlug: string,
  _prevState: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const courtId = formData.get("court_id") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string, 10);

  if (!courtId || !date || !startTime) return { error: "Datos incompletos." };

  const { error } = await supabase.rpc("update_reservation", {
    p_reservation_id: reservationId,
    p_court_id: courtId,
    p_date: date,
    p_start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
    p_duration_minutes: durationMinutes,
  });

  if (error) {
    console.error("[updateMyReservation] update_reservation failed:", { reservationId, supabaseError: error });
    return { error: mapUpdateReservationError(error) };
  }

  const { error: notifyError } = await supabase.rpc("notify_reservation_updated", {
    p_reservation_id: reservationId,
  });
  if (notifyError) {
    console.error("[updateMyReservation] notify_reservation_updated RPC failed", {
      reservationId,
      userId: user.id,
      code: notifyError.code,
      message: notifyError.message,
    });
  }

  revalidatePath(`/${clubSlug}/reservations`);
  revalidatePath(`/${clubSlug}/home`);
  return { success: true };
}
