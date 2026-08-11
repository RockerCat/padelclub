// Fuente única de verdad para duraciones de reserva — portado de
// src/lib/durations.ts (app web), usado tanto por los formularios de
// admin/jugador en WEB como por mobile.
//
// Limitado a {60, 90, 120} — coincide con el CHECK constraint de
// clubs.allowed_reservation_durations (20260802000003_restrict_allowed_durations.sql)
// y con el cálculo proporcional del motor de tarifas (×1, ×1.5, ×2). Nunca
// re-agregar 150/180 aquí sin antes ampliar ese CHECK, o la UI ofrecería
// una duración que la base de datos rechaza al insertar.
export const DURATION_CATALOG = [
  { minutes: 60, label: "1 hora" },
  { minutes: 90, label: "1 h 30 min" },
  { minutes: 120, label: "2 horas" },
] as const;

export type AllowedMinutes = (typeof DURATION_CATALOG)[number]["minutes"];

const VALID_MINUTES = DURATION_CATALOG.map((d) => d.minutes) as number[];

export const DEFAULT_ALLOWED_DURATIONS: number[] = [60, 90, 120];

/** Duraciones permitidas del club, con fallback a los defaults si no hay configuración válida. */
export function getClubDurations(val: number[] | null | undefined): number[] {
  if (!val || val.length === 0) return DEFAULT_ALLOWED_DURATIONS;
  const valid = val.filter((d) => VALID_MINUTES.includes(d)).sort((a, b) => a - b);
  return valid.length > 0 ? valid : DEFAULT_ALLOWED_DURATIONS;
}

/** Etiqueta legible para una cantidad de minutos dada. */
export function durationLabel(minutes: number): string {
  return DURATION_CATALOG.find((d) => d.minutes === minutes)?.label ?? `${minutes} min`;
}

/** Entradas de DURATION_CATALOG filtradas a solo las permitidas. */
export function durationOptions(allowed: number[]) {
  return DURATION_CATALOG.filter((d) => allowed.includes(d.minutes));
}
