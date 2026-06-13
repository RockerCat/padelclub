"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getEffectiveHour,
  timeToMinutes,
  validateAgainstOperatingHours,
} from "@/lib/operatingHours";
import type { OperatingHour } from "@/lib/operatingHours";
import { getClubDurations } from "@/lib/durations";

export type RequestFormState = { error?: string; success?: boolean };

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

  const today = new Date().toISOString().split("T")[0];
  if (date < today) return { error: "No puedes reservar en una fecha pasada." };

  if (date === today) {
    const [h, m] = startTime.split(":").map(Number);
    const now = new Date();
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

  const { error: insertError } = await supabase.from("reservations").insert({
    club_id: clubId,
    court_id: courtId,
    created_by: user.id,
    date,
    start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
    duration_minutes: durationMinutes,
    type: "match",
    status: "pending",
  });

  if (insertError) {
    console.error("requestReservation:", insertError);
    return { error: "Error al enviar la solicitud. Intenta nuevamente." };
  }

  return { success: true };
}
