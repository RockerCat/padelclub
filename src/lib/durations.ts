// Shared constants and helpers for reservation durations.
// Single source of truth for both admin and player forms.

export const DURATION_CATALOG = [
  { minutes: 60, label: "1 hora" },
  { minutes: 90, label: "1 h 30 min" },
  { minutes: 120, label: "2 horas" },
  { minutes: 150, label: "2 h 30 min" },
  { minutes: 180, label: "3 horas" },
] as const;

export type AllowedMinutes = (typeof DURATION_CATALOG)[number]["minutes"];

const VALID_MINUTES = DURATION_CATALOG.map((d) => d.minutes) as number[];

export const DEFAULT_ALLOWED_DURATIONS: number[] = [60, 90, 120];

/** Returns the club's allowed durations, falling back to defaults if unset or invalid. */
export function getClubDurations(val: number[] | null | undefined): number[] {
  if (!val || val.length === 0) return DEFAULT_ALLOWED_DURATIONS;
  const valid = val.filter((d) => VALID_MINUTES.includes(d)).sort((a, b) => a - b);
  return valid.length > 0 ? valid : DEFAULT_ALLOWED_DURATIONS;
}

/** Human-readable label for a given number of minutes. */
export function durationLabel(minutes: number): string {
  return DURATION_CATALOG.find((d) => d.minutes === minutes)?.label ?? `${minutes} min`;
}

/** DURATION_CATALOG entries filtered to only those in the allowed list. */
export function durationOptions(allowed: number[]) {
  return DURATION_CATALOG.filter((d) => allowed.includes(d.minutes));
}
