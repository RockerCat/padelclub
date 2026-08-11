// OperatingHour/DAY_NAMES/DEFAULT_OPERATING_HOURS/timeToMinutes/
// getEffectiveHour ya NO se definen aquí — viven en
// shared/reservations/operatingHours.ts (la misma fuente que
// courtAvailability.ts y mobile ahora reutilizan), re-exportados bajo
// estos mismos nombres para que ningún import existente de
// "@/lib/operatingHours" tenga que cambiar. Todo lo demás en este
// archivo (buildScheduleSummary, generateTimeOptions,
// validateOperatingHours, computeWeekly*/computeAvailableMinutes*,
// validateAgainstOperatingHours) es específico de Club Settings/
// Estadísticas — fuera del alcance de la migración de Reservaciones a
// shared/, se queda aquí tal cual, solo que ahora usa el timeToMinutes/
// getEffectiveHour compartidos en vez de una copia local.
export { type OperatingHour, DAY_NAMES, DEFAULT_OPERATING_HOURS, timeToMinutes, getEffectiveHour } from "../../shared/reservations/operatingHours";

import type { OperatingHour } from "../../shared/reservations/operatingHours";
import { DAY_NAMES, DEFAULT_OPERATING_HOURS, timeToMinutes, getEffectiveHour } from "../../shared/reservations/operatingHours";

export type ScheduleGroup = { label: string; timeRange: string };

const SCHEDULE_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun display order

// Groups consecutive days sharing the same opens_at/closes_at into a single
// range, e.g. "Lunes – Viernes · 06:00 – 22:00" — used by the public club
// profile and the Settings "Horarios" summary card, so both always agree.
export function buildScheduleSummary(hours: OperatingHour[]): ScheduleGroup[] {
  const open = hours
    .filter((h) => h.is_open && h.opens_at && h.closes_at)
    .sort((a, b) => SCHEDULE_DAY_ORDER.indexOf(a.day_of_week) - SCHEDULE_DAY_ORDER.indexOf(b.day_of_week));

  type G = { startDay: number; endDay: number; opens: string; closes: string };
  const groups: G[] = [];

  for (const h of open) {
    const last = groups[groups.length - 1];
    const prevI = last != null ? SCHEDULE_DAY_ORDER.indexOf(last.endDay) : -2;
    const currI = SCHEDULE_DAY_ORDER.indexOf(h.day_of_week);
    if (last && currI === prevI + 1 && last.opens === h.opens_at && last.closes === h.closes_at) {
      last.endDay = h.day_of_week;
    } else {
      groups.push({ startDay: h.day_of_week, endDay: h.day_of_week, opens: h.opens_at!, closes: h.closes_at! });
    }
  }

  return groups.map(({ startDay, endDay, opens, closes }) => ({
    label: startDay === endDay ? DAY_NAMES[startDay] : `${DAY_NAMES[startDay]} – ${DAY_NAMES[endDay]}`,
    timeRange: `${opens.slice(0, 5)} – ${closes.slice(0, 5)}`,
  }));
}

// 24h-only "HH:MM" options in 30-minute steps, e.g. ["00:00","00:30",...,"23:30"].
// Used by the operating hours <select> pickers so opening/closing times are never
// entered through a locale-dependent native time input (no AM/PM ambiguity).
export function generateTimeOptions(stepMinutes = 30): string[] {
  const options: string[] = [];
  for (let m = 0; m < 24 * 60; m += stepMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    options.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return options;
}

// Per-day validation for the operating hours form: a day that is open needs
// both times set, with closes_at strictly after opens_at. Closed days are
// always valid regardless of their stored opens_at/closes_at values.
export function validateOperatingHours(hours: OperatingHour[]): Map<number, string> {
  const errors = new Map<number, string>();
  for (const h of hours) {
    if (!h.is_open) continue;
    if (!h.opens_at || !h.closes_at) {
      errors.set(h.day_of_week, "Ingresa hora de apertura y de cierre.");
      continue;
    }
    if (timeToMinutes(h.opens_at) >= timeToMinutes(h.closes_at)) {
      errors.set(h.day_of_week, "La hora de cierre debe ser posterior a la de apertura.");
    }
  }
  return errors;
}

// Total available minutes across a week.
// weekDayNumbers: JS getDay() values for the 7 days, e.g. Mon–Sun = [1,2,3,4,5,6,0]
export function computeWeeklyAvailableMinutes(
  dbHours: OperatingHour[],
  weekDayNumbers: number[]
): number {
  let total = 0;
  for (const dayNum of weekDayNumbers) {
    const h = getEffectiveHour(dbHours, dayNum);
    if (!h.is_open || !h.opens_at || !h.closes_at) continue;
    total += timeToMinutes(h.closes_at) - timeToMinutes(h.opens_at);
  }
  return total;
}

// Available minutes across an arbitrary date range (inclusive), based on each
// calendar day's weekday hours. Used as the occupancy denominator for ranges
// that aren't exactly one week (this_month, this_semester, etc).
export function computeAvailableMinutesForRange(
  hours: OperatingHour[],
  startDate: Date,
  endDate: Date
): number {
  let total = 0;
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const h = getEffectiveHour(hours, cur.getDay());
    if (h.is_open && h.opens_at && h.closes_at) {
      total += timeToMinutes(h.closes_at) - timeToMinutes(h.opens_at);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

// Available minutes per weekday across an arbitrary date range (inclusive) —
// index 0=Dom..6=Sáb. Same per-day logic as computeAvailableMinutesForRange,
// but bucketed by weekday instead of summed into a single total. Used to
// compute occupancy "por día de la semana" within the selected range.
export function computeAvailableMinutesByWeekday(
  hours: OperatingHour[],
  startDate: Date,
  endDate: Date
): number[] {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const dayNum = cur.getDay();
    const h = getEffectiveHour(hours, dayNum);
    if (h.is_open && h.opens_at && h.closes_at) {
      totals[dayNum] += timeToMinutes(h.closes_at) - timeToMinutes(h.opens_at);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return totals;
}

// Returns an error string if the reservation conflicts with operating hours, or null if OK.
export function validateAgainstOperatingHours(
  hours: OperatingHour,
  startTime: string,
  durationMinutes: number
): string | null {
  if (!hours.is_open) return "El club está cerrado este día.";
  if (!hours.opens_at || !hours.closes_at) return null;

  const startMin = timeToMinutes(startTime);
  const endMin = startMin + durationMinutes;
  const openMin = timeToMinutes(hours.opens_at);
  const closeMin = timeToMinutes(hours.closes_at);

  if (startMin < openMin) {
    return `La reserva no puede empezar antes de las ${hours.opens_at.slice(0, 5)}.`;
  }
  if (endMin > closeMin) {
    return `La reserva no puede terminar después de las ${hours.closes_at.slice(0, 5)}.`;
  }
  return null;
}
