"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getEffectiveHour,
  timeToMinutes,
  validateAgainstOperatingHours,
} from "@/lib/operatingHours";
import type { OperatingHour } from "@/lib/operatingHours";
import { getClubDurations } from "@/lib/durations";
import { resolveReservationPrice } from "@/lib/reservationPricing";
import type { ResolveReservationPriceResult } from "@/lib/reservationPricing";

export type RequestFormState = { error?: string; success?: boolean };

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

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();
  if (!membership) return { error: "Sin acceso al club." };

  const courtId = formData.get("court_id") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string, 10);

  // Fetch allowed durations for this club
  const { data: clubData } = await supabase
    .from("clubs")
    .select("allowed_reservation_durations")
    .eq("id", clubId)
    .single();
  const allowedDurations = getClubDurations(clubData?.allowed_reservation_durations);

  if (!courtId || !date || !startTime) {
    return { error: "Datos incompletos." };
  }

  if (!allowedDurations.includes(durationMinutes)) {
    return { error: "Esta duración no está permitida para este club." };
  }

  // Local calendar date (getFullYear/getMonth/getDate), never
  // toISOString() — that converts to UTC first, so near a UTC offset
  // boundary (e.g. after ~19:00 in UTC-5) it silently rolls over to
  // "tomorrow" while now.getHours()/getMinutes() below still read local
  // time, comparing two different days as if they were the same one.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (date < todayStr) return { error: "No puedes reservar en una fecha pasada." };

  if (date === todayStr) {
    const [h, m] = startTime.split(":").map(Number);
    if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) {
      return { error: "El horario seleccionado ya pasó." };
    }
  }

  const { data: court } = await supabase
    .from("courts")
    .select("id")
    .eq("id", courtId)
    .eq("club_id", clubId)
    .eq("is_active", true)
    .single();
  if (!court) return { error: "Cancha no disponible." };

  const { data: dbHours } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", clubId);

  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  const effectiveHours = getEffectiveHour((dbHours ?? []) as OperatingHour[], dayOfWeek);
  const hoursError = validateAgainstOperatingHours(effectiveHours, startTime, durationMinutes);
  if (hoursError) return { error: hoursError };

  // Check overlap against both confirmed AND pending reservations
  const { data: existing } = await supabase
    .from("reservations")
    .select("start_time, duration_minutes")
    .eq("court_id", courtId)
    .eq("date", date)
    .in("status", ["confirmed", "pending"]);

  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + durationMinutes;
  for (const r of existing ?? []) {
    const rStart = timeToMinutes(r.start_time);
    const rEnd = rStart + r.duration_minutes;
    if (newStart < rEnd && newEnd > rStart) {
      return { error: "El horario ya fue tomado. Selecciona otro." };
    }
  }

  // Price is resolved fresh here, server-side, right before the insert —
  // never trusted from the client (the form never even submits a price
  // field). A PLAYER request with no applicable tariff is not created at
  // all: this is a new-request gate only, it must never affect historical
  // reservations that already have their 4 price fields NULL (those rows
  // are never touched by this function).
  const priceResult = await resolveReservationPrice(supabase, {
    clubId,
    courtId,
    date,
    startTime,
    durationMinutes,
  });
  if (!priceResult.matched) {
    return { error: "No hay una tarifa configurada para este horario. Contacta al club para continuar con la reserva." };
  }

  const { data: reservation, error: insertError } = await supabase
    .from("reservations")
    .insert({
      club_id: clubId,
      court_id: courtId,
      created_by: user.id,
      date,
      start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
      duration_minutes: durationMinutes,
      type: "match",
      status: "pending",
      price_amount: priceResult.finalPrice,
      price_currency: priceResult.currency,
      pricing_rule_id: priceResult.ruleId,
      price_calculated_at: priceResult.calculatedAt,
    })
    .select("id")
    .single();

  if (insertError || !reservation) {
    console.error("requestReservation:", insertError);
    return { error: "Error al enviar la solicitud. Intenta nuevamente." };
  }

  const { error: notifyError } = await supabase.rpc("notify_reservation_request_created", {
    p_reservation_id: reservation.id,
  });
  // Notifying admins is best-effort — the reservation request itself already
  // succeeded and must not be rolled back, and the player must never see a
  // false failure, over a notification-only error. Logged with enough
  // context to diagnose (reservation/club ids, Postgrest error code) without
  // including player-identifying data.
  if (notifyError) {
    console.error("[requestReservation] notify_reservation_request_created RPC failed", {
      reservationId: reservation.id,
      userId: user.id,
      clubId,
      code: notifyError.code,
      message: notifyError.message,
    });
  }

  return { success: true };
}
