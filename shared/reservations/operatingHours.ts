// Primitivas de horario/tiempo compartidas por WEB y mobile — antes
// existían dos copias equivalentes dentro de la propia WEB
// (src/lib/operatingHours.ts::timeToMinutes y
// src/lib/courtAvailability.ts::timeToMins hacían exactamente lo mismo,
// con nombres distintos) y una tercera copia portada a mano en mobile
// (src/lib/operatingHours.ts + src/lib/time.ts). Esta es la única fuente
// ahora: src/lib/operatingHours.ts y src/lib/courtAvailability.ts (app
// web) re-exportan estos nombres bajo sus propios alias históricos para
// que ningún import existente tenga que cambiar; mobile/src/lib/
// operatingHours.ts y mobile/src/lib/time.ts hacen lo mismo.
//
// Pura — sin React, sin Next.js, sin dependencias de plataforma.

export type OperatingHour = {
  day_of_week: number; // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  is_open: boolean;
  opens_at: string | null; // "HH:MM" o "HH:MM:SS"
  closes_at: string | null;
};

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Defaults aplicados cuando un club no tiene horario configurado para un día.
export const DEFAULT_OPERATING_HOURS: OperatingHour[] = [
  { day_of_week: 0, is_open: false, opens_at: null, closes_at: null }, // Domingo
  { day_of_week: 1, is_open: true, opens_at: "06:00", closes_at: "22:00" }, // Lunes
  { day_of_week: 2, is_open: true, opens_at: "06:00", closes_at: "22:00" }, // Martes
  { day_of_week: 3, is_open: true, opens_at: "06:00", closes_at: "22:00" }, // Miércoles
  { day_of_week: 4, is_open: true, opens_at: "06:00", closes_at: "22:00" }, // Jueves
  { day_of_week: 5, is_open: true, opens_at: "06:00", closes_at: "22:00" }, // Viernes
  { day_of_week: 6, is_open: true, opens_at: "08:00", closes_at: "18:00" }, // Sábado
];

export function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function addMinutes(time: string, mins: number): string {
  return minsToTime(timeToMinutes(time) + mins);
}

// Reconstruye la misma grilla base de 30 minutos que el servidor genera
// para la ventana operativa de un día — solo para que un timeline tenga
// marcas que renderizar. Si una marca es seleccionable/ocupada/solicitada
// sigue viniendo siempre de los datos reales de slots/bloqueos pasados,
// nunca de esta grilla sola.
export function buildDayGrid(openMins: number | undefined, closeMins: number | undefined, minDuration: number): string[] {
  if (openMins === undefined || closeMins === undefined) return [];
  const grid: string[] = [];
  for (let t = openMins; t + minDuration <= closeMins; t += 30) grid.push(minsToTime(t));
  return grid;
}

export function getEffectiveHour(dbHours: OperatingHour[], dayOfWeek: number): OperatingHour {
  return dbHours.find((h) => h.day_of_week === dayOfWeek) ?? DEFAULT_OPERATING_HOURS.find((h) => h.day_of_week === dayOfWeek)!;
}

export type ScheduleGroup = { label: string; timeRange: string };

const SCHEDULE_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun display order

// Groups consecutive days sharing the same opens_at/closes_at into a single
// range, e.g. "Lunes – Viernes · 06:00 – 22:00" — used by the public club
// profile and the Settings "Horarios" summary card (WEB), and the mobile
// PLAYER "Página del club" screen, so all three always agree.
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
