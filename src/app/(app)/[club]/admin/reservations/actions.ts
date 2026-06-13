"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getEffectiveHour,
  validateAgainstOperatingHours,
  timeToMinutes as sharedTimeToMinutes,
} from "@/lib/operatingHours";
import { getClubDurations } from "@/lib/durations";

export type ReservationFormState = {
  error?: string;
  success?: boolean;
};

const isDev = process.env.NODE_ENV === "development";

// ─── Permission guard ─────────────────────────────────────────────────────────

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[reservations] auth.getUser failed:", userError);
    return { supabase: null, user: null, error: "No autenticado." };
  }

  const { data: membership, error: memberError } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (memberError) {
    console.error("[reservations] membership lookup failed:", memberError);
  }

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    console.error("[reservations] access denied — role:", membership?.role ?? "none", "userId:", user.id, "clubId:", clubId);
    return { supabase: null, user: null, error: "Sin permiso." };
  }

  return { supabase, user, error: null };
}

// ─── Operating hours check ────────────────────────────────────────────────────

async function checkOperatingHours(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clubId: string,
  date: string,
  startTime: string,
  durationMinutes: number
): Promise<string | null> {
  const d = new Date(date + "T00:00:00");
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  const { data } = await supabase
    .from("club_operating_hours")
    .select("is_open, opens_at, closes_at")
    .eq("club_id", clubId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  const hours = getEffectiveHour(
    data
      ? [{ day_of_week: dayOfWeek, is_open: data.is_open, opens_at: data.opens_at, closes_at: data.closes_at }]
      : [],
    dayOfWeek
  );

  return validateAgainstOperatingHours(hours, startTime, durationMinutes);
}

// ─── Overlap check ────────────────────────────────────────────────────────────

async function checkOverlap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  courtId: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  excludeId?: string
): Promise<boolean> {
  let query = supabase
    .from("reservations")
    .select("start_time, duration_minutes")
    .eq("court_id", courtId)
    .eq("date", date)
    .eq("status", "confirmed");

  if (excludeId) query = query.neq("id", excludeId);

  const { data: existing, error } = await query;

  if (error) {
    console.error("[reservations] overlap check query failed:", error);
    // Don't block the insert on overlap check failure
    return false;
  }

  const newStart = sharedTimeToMinutes(startTime);
  const newEnd = newStart + durationMinutes;

  for (const r of existing ?? []) {
    const existStart = sharedTimeToMinutes(r.start_time);
    const existEnd = existStart + r.duration_minutes;
    if (newStart < existEnd && newEnd > existStart) return true;
  }
  return false;
}

// ─── Parse + validate ─────────────────────────────────────────────────────────

function parseFormData(formData: FormData) {
  const courtId = (formData.get("court_id") as string | null)?.trim() ?? "";
  const date = (formData.get("date") as string | null)?.trim() ?? "";
  const rawTime = (formData.get("start_time") as string | null)?.trim() ?? "";
  // Browser sends HH:MM; Postgres time accepts HH:MM but we normalise to HH:MM:SS
  const startTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
  const durationMinutes = parseInt(
    (formData.get("duration_minutes") as string | null) ?? "60",
    10
  );
  const type = (formData.get("type") as string | null)?.trim() ?? "match";
  const title = (formData.get("title") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const playerIds = formData.getAll("players") as string[];

  return { courtId, date, startTime, durationMinutes, type, title, notes, playerIds };
}

async function getClubAllowedDurations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clubId: string
): Promise<number[]> {
  const { data } = await supabase
    .from("clubs")
    .select("allowed_reservation_durations")
    .eq("id", clubId)
    .single();
  return getClubDurations(data?.allowed_reservation_durations);
}

function validate(
  courtId: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  type: string,
  title: string | null,
  allowedDurations: number[]
): string | null {
  if (!courtId) return "Selecciona una cancha.";
  if (!date) return "Selecciona una fecha.";
  if (!startTime || startTime === ":00") return "Selecciona una hora de inicio.";
  if (!allowedDurations.includes(durationMinutes)) return "Esta duración no está permitida para este club.";
  if (!["match", "class", "block"].includes(type)) return "Tipo inválido.";
  if (type === "block" && !title) return "El título es obligatorio para bloqueos.";
  return null;
}

// Construct a local datetime from YYYY-MM-DD + HH:MM[:SS] and compare to now.
// ISO 8601 without timezone offset is treated as local time in V8 (Node.js ≥ ES2015).
function checkNotInPast(date: string, startTime: string): string | null {
  const startDatetime = new Date(`${date}T${startTime.slice(0, 5)}`);
  if (startDatetime.getTime() < Date.now()) {
    return "La reserva no puede estar en el pasado.";
  }
  return null;
}

// ─── createReservation ────────────────────────────────────────────────────────

export async function createReservation(
  clubId: string,
  clubSlug: string,
  noRedirect: boolean,
  _prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  const { courtId, date, startTime, durationMinutes, type, title, notes, playerIds } =
    parseFormData(formData);

  console.log("[createReservation] parsed input:", {
    clubId,
    courtId,
    date,
    startTime,
    duration: durationMinutes,
    type,
    title,
    players: playerIds,
  });

  const allowedDurations = await getClubAllowedDurations(supabase, clubId);
  const validationError = validate(courtId, date, startTime, durationMinutes, type, title, allowedDurations);
  if (validationError) {
    console.log("[createReservation] validation failed:", validationError);
    return { error: validationError };
  }

  const pastError = checkNotInPast(date, startTime);
  if (pastError) return { error: pastError };

  // Verify court belongs to this club and is active
  const { data: court, error: courtError } = await supabase
    .from("courts")
    .select("id")
    .eq("id", courtId)
    .eq("club_id", clubId)
    .eq("is_active", true)
    .single();

  if (courtError) {
    console.error("[createReservation] court lookup error:", courtError);
  }
  if (!court) {
    return { error: isDev ? `[DEV] Cancha no encontrada o inactiva (court_id: ${courtId})` : "La cancha seleccionada no está disponible." };
  }

  // Operating hours check
  const hoursError = await checkOperatingHours(supabase, clubId, date, startTime, durationMinutes);
  if (hoursError) return { error: hoursError };

  // Overlap check
  const hasOverlap = await checkOverlap(supabase, courtId, date, startTime, durationMinutes);
  if (hasOverlap) {
    return { error: "Ya existe una reserva en ese horario para esta cancha." };
  }

  // Insert reservation
  const reservationData = {
    club_id: clubId,
    court_id: courtId,
    created_by: user.id,
    date,
    start_time: startTime,
    duration_minutes: durationMinutes,
    type: type as "match" | "class" | "block",
    title,
    notes,
  };

  console.log("[createReservation] inserting:", reservationData);

  const { data: reservation, error: insertError } = await supabase
    .from("reservations")
    .insert(reservationData)
    .select("id")
    .single();

  if (insertError || !reservation) {
    console.error("[createReservation] insert failed:", {
      clubId,
      courtId,
      date,
      startTime,
      duration: durationMinutes,
      players: playerIds,
      reservationData,
      supabaseError: insertError,
    });
    return {
      error: isDev
        ? `[DEV] Error al insertar: ${insertError?.message ?? "sin datos"} (código: ${insertError?.code ?? "—"}, hint: ${insertError?.hint ?? "—"})`
        : "Error al crear la reserva. Intenta de nuevo.",
    };
  }

  // Insert players
  if (playerIds.length > 0) {
    const { error: playersError } = await supabase
      .from("reservation_players")
      .insert(playerIds.map((profileId) => ({ reservation_id: reservation.id, profile_id: profileId })));

    if (playersError) {
      console.error("[createReservation] players insert failed:", {
        reservationId: reservation.id,
        playerIds,
        supabaseError: playersError,
      });
      // Reservation was created; don't block on player insert failure
    }
  }

  console.log("[createReservation] success — reservationId:", reservation.id);
  if (noRedirect) return { success: true };
  redirect(`/${clubSlug}/admin/reservations`);
}

// ─── updateReservation ────────────────────────────────────────────────────────

export async function updateReservation(
  clubId: string,
  clubSlug: string,
  reservationId: string,
  noRedirect: boolean,
  _prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data: currentStatus } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .maybeSingle();

  if (currentStatus?.status === "cancelled") {
    return { error: "No se puede editar una reserva cancelada." };
  }

  const { courtId, date, startTime, durationMinutes, type, title, notes, playerIds } =
    parseFormData(formData);

  console.log("[updateReservation] parsed input:", { reservationId, clubId, courtId, date, startTime, duration: durationMinutes, type, title, players: playerIds });

  const allowedDurations = await getClubAllowedDurations(supabase, clubId);
  const validationError = validate(courtId, date, startTime, durationMinutes, type, title, allowedDurations);
  if (validationError) return { error: validationError };

  const pastError = checkNotInPast(date, startTime);
  if (pastError) return { error: pastError };

  const { data: court, error: courtError } = await supabase
    .from("courts")
    .select("id")
    .eq("id", courtId)
    .eq("club_id", clubId)
    .eq("is_active", true)
    .single();

  if (courtError) console.error("[updateReservation] court lookup error:", courtError);
  if (!court) {
    return { error: isDev ? `[DEV] Cancha no encontrada (court_id: ${courtId})` : "La cancha seleccionada no está disponible." };
  }

  const hoursErrorUpdate = await checkOperatingHours(supabase, clubId, date, startTime, durationMinutes);
  if (hoursErrorUpdate) return { error: hoursErrorUpdate };

  const hasOverlap = await checkOverlap(supabase, courtId, date, startTime, durationMinutes, reservationId);
  if (hasOverlap) return { error: "Ya existe una reserva en ese horario para esta cancha." };

  const { error: updateError } = await supabase
    .from("reservations")
    .update({ court_id: courtId, date, start_time: startTime, duration_minutes: durationMinutes, type: type as "match" | "class" | "block", title, notes })
    .eq("id", reservationId)
    .eq("club_id", clubId);

  if (updateError) {
    console.error("[updateReservation] update failed:", { reservationId, supabaseError: updateError });
    return {
      error: isDev
        ? `[DEV] Error al actualizar: ${updateError.message} (código: ${updateError.code})`
        : "Error al guardar los cambios. Intenta de nuevo.",
    };
  }

  // Replace players
  await supabase.from("reservation_players").delete().eq("reservation_id", reservationId);

  if (playerIds.length > 0) {
    const { error: playersError } = await supabase
      .from("reservation_players")
      .insert(playerIds.map((profileId) => ({ reservation_id: reservationId, profile_id: profileId })));

    if (playersError) console.error("[updateReservation] players insert failed:", playersError);
  }

  if (noRedirect) return { success: true };
  redirect(`/${clubSlug}/admin/reservations?updated=1`);
}

// ─── getAvailableSlots ────────────────────────────────────────────────────────

function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export async function getAvailableSlots(
  clubId: string,
  courtId: string,
  date: string,
  durationMinutes: number,
  excludeReservationId?: string
): Promise<{ slots: string[]; closed: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { slots: [], closed: false };

  // Effective operating hours for this day
  const [y, mo, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(y, mo - 1, d).getDay();

  const { data: ohRow } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", clubId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  const hours = getEffectiveHour(
    ohRow
      ? [{ day_of_week: dayOfWeek, is_open: ohRow.is_open, opens_at: ohRow.opens_at, closes_at: ohRow.closes_at }]
      : [],
    dayOfWeek
  );

  if (!hours.is_open || !hours.opens_at || !hours.closes_at) {
    return { slots: [], closed: true };
  }

  const openMins = sharedTimeToMinutes(hours.opens_at);
  const closeMins = sharedTimeToMinutes(hours.closes_at);

  // Base 30-min aligned slots; slot is valid only if full duration fits before close
  const baseSlots: string[] = [];
  for (let t = openMins; t + durationMinutes <= closeMins; t += 30) {
    baseSlots.push(minsToTime(t));
  }

  // Filter past slots when date is today (server-side best-effort)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const futureSlots =
    date === todayStr
      ? baseSlots.filter((s) => sharedTimeToMinutes(s) > now.getHours() * 60 + now.getMinutes())
      : baseSlots;

  // Fetch existing confirmed reservations for conflict detection
  let resQuery = supabase
    .from("reservations")
    .select("start_time, duration_minutes")
    .eq("club_id", clubId)
    .eq("court_id", courtId)
    .eq("date", date)
    .eq("status", "confirmed");

  if (excludeReservationId) resQuery = resQuery.neq("id", excludeReservationId);

  const { data: existing } = await resQuery;

  // Slot is blocked if the full window [slotStart, slotStart+duration) overlaps any existing reservation
  const available = futureSlots.filter((slot) => {
    const slotStart = sharedTimeToMinutes(slot);
    const slotEnd = slotStart + durationMinutes;
    return !(existing ?? []).some((r) => {
      const rStart = sharedTimeToMinutes(r.start_time);
      const rEnd = rStart + r.duration_minutes;
      return slotStart < rEnd && slotEnd > rStart;
    });
  });

  return { slots: available, closed: false };
}

// ─── getReservationForEdit ────────────────────────────────────────────────────

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

// ─── Pending reservation approval / rejection ─────────────────────────────────

export type PendingActionResult = { success?: boolean; error?: string };

export async function approvePendingReservation(
  clubId: string,
  reservationId: string
): Promise<PendingActionResult> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError ?? "Sin permiso." };

  // Fetch the reservation (must be pending + belong to this club)
  const { data: res } = await supabase
    .from("reservations")
    .select("id, court_id, date, start_time, duration_minutes, status")
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .single();

  if (!res) return { error: "Solicitud no encontrada." };
  if (res.status !== "pending") return { error: "La solicitud ya fue procesada." };

  // Validate duration against club config
  const allowedDurations = await getClubAllowedDurations(supabase, clubId);
  if (!allowedDurations.includes(res.duration_minutes)) {
    return { error: "Duración no permitida por el club." };
  }

  // Validate court still active
  const { data: court } = await supabase
    .from("courts")
    .select("id")
    .eq("id", res.court_id)
    .eq("club_id", clubId)
    .eq("is_active", true)
    .single();
  if (!court) return { error: "La cancha ya no está disponible." };

  // Validate operating hours
  const hoursError = await checkOperatingHours(
    supabase,
    clubId,
    res.date,
    res.start_time,
    res.duration_minutes
  );
  if (hoursError) return { error: hoursError };

  // Check overlap with CONFIRMED reservations (exclude self so PENDING doesn't block itself)
  const hasOverlap = await checkOverlap(
    supabase,
    res.court_id,
    res.date,
    res.start_time,
    res.duration_minutes,
    reservationId
  );
  if (hasOverlap) return { error: "El horario fue confirmado para otra reserva." };

  const { error: updateErr } = await supabase
    .from("reservations")
    .update({ status: "confirmed" })
    .eq("id", reservationId)
    .eq("club_id", clubId);

  if (updateErr) {
    console.error("[approvePendingReservation]", updateErr);
    return { error: "Error al confirmar la reserva. Intenta nuevamente." };
  }

  return { success: true };
}

export async function rejectPendingReservation(
  clubId: string,
  reservationId: string
): Promise<PendingActionResult> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError ?? "Sin permiso." };

  const { data: res } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .single();

  if (!res) return { error: "Solicitud no encontrada." };
  if (res.status !== "pending") return { error: "La solicitud ya fue procesada." };

  const { error: updateErr } = await supabase
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("club_id", clubId);

  if (updateErr) {
    console.error("[rejectPendingReservation]", updateErr);
    return { error: "Error al rechazar la solicitud. Intenta nuevamente." };
  }

  return { success: true };
}

export async function getReservationForEdit(
  clubId: string,
  reservationId: string
): Promise<ReservationEditData | null> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return null;

  const { data } = await supabase
    .from("reservations")
    .select(
      "court_id, date, start_time, duration_minutes, type, title, notes, status, reservation_players(profile_id)"
    )
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .single();

  if (!data || data.status === "cancelled") return null;

  return {
    court_id: data.court_id,
    date: data.date,
    start_time: data.start_time,
    duration_minutes: data.duration_minutes,
    type: data.type,
    title: data.title ?? null,
    notes: data.notes ?? null,
    player_ids: (data.reservation_players as unknown as Array<{ profile_id: string }>).map(
      (rp) => rp.profile_id
    ),
  };
}

// ─── cancelReservation ────────────────────────────────────────────────────────

export async function cancelReservation(
  clubId: string,
  clubSlug: string,
  reservationId: string
): Promise<void> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return;

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user.id })
    .eq("id", reservationId)
    .eq("club_id", clubId);

  if (error) console.error("[cancelReservation] failed:", { reservationId, supabaseError: error });

  redirect(`/${clubSlug}/admin/reservations?cancelled=1`);
}
