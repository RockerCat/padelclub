import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { getEffectiveHour, timeToMinutes, minsToTime } from "./operatingHours";
import type { OperatingHour } from "./operatingHours";
import { getBogotaNow } from "../utils/bogotaDatetime";

// ─── computeAvailability ────────────────────────────────────────────────────
// Portado de src/lib/courtDayAvailability.ts (app web) — la misma grilla de
// disponibilidad que la vista del jugador siempre usó, ahora también la
// única fuente para la vista OWNER/ADMIN de "Disponibilidad" y para
// mobile — ninguna de las tres puede divergir en una segunda regla
// ligeramente distinta.

export type RawReservation = { court_id: string; date: string; start_time: string; duration_minutes: number };
export type BlockedByDate = Record<string, Record<string, Array<[number, number]>>>;

export interface CourtDayAvailability {
  availability: Record<string, Record<string, string[]>>;
  closedDates: string[];
  openingMinsByDate: Record<string, number>;
  closingMinsByDate: Record<string, number>;
  blockedByDate: BlockedByDate;
}

// `reservations` debe incluir todo status que legítimamente ocupe un slot
// (confirmed + pending) — una solicitud pendiente ya ocupa su horario
// igual que una confirmada; rejected/cancelled nunca bloquean nada, así
// que los callers simplemente nunca incluyen esas filas aquí.
export function computeAvailability(
  courts: Array<{ id: string }>,
  weekDates: string[],
  opHours: OperatingHour[],
  reservations: RawReservation[],
  todayStr: string,
  nowMins: number,
  minDuration: number
): CourtDayAvailability {
  const availability: Record<string, Record<string, string[]>> = {};
  const closedDates: string[] = [];
  const openingMinsByDate: Record<string, number> = {};
  const closingMinsByDate: Record<string, number> = {};
  const blockedByDate: BlockedByDate = {};

  for (const date of weekDates) {
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    const hours = getEffectiveHour(opHours, dayOfWeek);
    availability[date] = {};
    blockedByDate[date] = {};

    if (!hours.is_open || !hours.opens_at || !hours.closes_at) {
      closedDates.push(date);
      for (const court of courts) {
        availability[date][court.id] = [];
        blockedByDate[date][court.id] = [];
      }
      continue;
    }

    const openMins = timeToMinutes(hours.opens_at);
    const closeMins = timeToMinutes(hours.closes_at);
    openingMinsByDate[date] = openMins;
    closingMinsByDate[date] = closeMins;

    const baseSlots: string[] = [];
    for (let t = openMins; t + minDuration <= closeMins; t += 30) baseSlots.push(minsToTime(t));
    const futureSlots = date === todayStr ? baseSlots.filter((s) => timeToMinutes(s) > nowMins) : baseSlots;

    for (const court of courts) {
      const courtRes = reservations.filter((r) => r.court_id === court.id && r.date === date);
      blockedByDate[date][court.id] = courtRes.map((r) => {
        const rStart = timeToMinutes(r.start_time);
        return [rStart, rStart + r.duration_minutes] as [number, number];
      });
      availability[date][court.id] = futureSlots.filter((slot) => {
        const slotMins = timeToMinutes(slot);
        return !courtRes.some((r) => {
          const rStart = timeToMinutes(r.start_time);
          const rEnd = rStart + r.duration_minutes;
          return slotMins >= rStart && slotMins < rEnd;
        });
      });
    }
  }

  return { availability, closedDates, openingMinsByDate, closingMinsByDate, blockedByDate };
}

// ─── getAvailableSlots ──────────────────────────────────────────────────────
// Portado de getAvailableSlots en
// src/app/(app)/[club]/admin/reservations/actions.ts (app web) — la misma
// consulta exacta, ahora la única implementación real: antes WEB y mobile
// tenían dos copias independientes de este algoritmo (ver el bug de
// timezone documentado en CLAUDE.md → Notifications & Live-Update
// Principles / getBogotaNow), y aunque ya se habían corregido para usar
// getBogotaNow en ambos lados, seguían siendo dos implementaciones que
// podían volver a divergir. Esta función no incluye el check de sesión
// (`if (!user) return ...`) de la Server Action — eso es responsabilidad
// del caller (revisar auth es específico de cada plataforma), ni el
// wrapper requireAdminRole (RLS es la autoridad real, igual que el resto
// de queries portadas de este proyecto).
export type AvailableSlotsResult = {
  slots: string[];
  closed: boolean;
  // Presente siempre que el día esté abierto — permite al caller
  // reconstruir la misma grilla del día (buildDayGrid) sin una segunda
  // consulta de horario. Callers que solo desestructuran {slots, closed}
  // no se ven afectados.
  openMins?: number;
  closeMins?: number;
};

export async function getAvailableSlots(
  supabase: SupabaseClient<Database>,
  clubId: string,
  courtId: string,
  date: string,
  durationMinutes: number,
  excludeReservationId?: string
): Promise<AvailableSlotsResult> {
  const [y, mo, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(y, mo - 1, d).getDay();

  const { data: ohRow } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", clubId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  const hours = getEffectiveHour(ohRow ? [ohRow] : [], dayOfWeek);
  if (!hours.is_open || !hours.opens_at || !hours.closes_at) return { slots: [], closed: true };

  const openMins = timeToMinutes(hours.opens_at);
  const closeMins = timeToMinutes(hours.closes_at);

  const baseSlots: string[] = [];
  for (let t = openMins; t + durationMinutes <= closeMins; t += 30) baseSlots.push(minsToTime(t));

  // "Hoy"/"ahora" son siempre la hora de pared de Bogotá (getBogotaNow) —
  // nunca la hora local del proceso que evalúa el código (ver
  // shared/utils/bogotaDatetime.ts).
  const { dateStr: todayStr, minutesOfDay: nowMins } = getBogotaNow();
  const futureSlots = date === todayStr ? baseSlots.filter((s) => timeToMinutes(s) > nowMins) : baseSlots;

  let resQuery = supabase
    .from("reservations")
    .select("start_time, duration_minutes")
    .eq("club_id", clubId)
    .eq("court_id", courtId)
    .eq("date", date)
    .eq("status", "confirmed");
  if (excludeReservationId) resQuery = resQuery.neq("id", excludeReservationId);
  const { data: existing } = await resQuery;

  const available = futureSlots.filter((slot) => {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + durationMinutes;
    return !(existing ?? []).some((r) => {
      const rStart = timeToMinutes(r.start_time);
      const rEnd = rStart + r.duration_minutes;
      return slotStart < rEnd && slotEnd > rStart;
    });
  });

  return { slots: available, closed: false, openMins, closeMins };
}
