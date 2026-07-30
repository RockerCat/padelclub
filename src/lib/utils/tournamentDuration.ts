// Torneos — formato compartido de tournaments.estimated_duration_minutes.
// Un único punto de formato reutilizado por el formulario (label dinámico)
// y por cualquier vista de solo lectura (detalle, tarjeta) — nunca una
// segunda implementación del mismo texto.

export const MINUTES_PER_PAIR = 30;

export function defaultEstimatedDurationMinutes(maxPairs: number): number {
  return Math.max(MINUTES_PER_PAIR, maxPairs * MINUTES_PER_PAIR);
}

export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) return `${remaining} min`;
  if (remaining === 0) return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return `${hours} ${hours === 1 ? "hora" : "horas"} ${remaining} min`;
}

// El formulario de creación/edición solo le muestra horas al organizador
// (nunca minutos) — estas dos conversiones son el único punto de verdad
// entre ese input en horas y el minutos que sigue almacenándose y
// enviándose al backend sin cambios.
export function minutesToHoursInputValue(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return Number((minutes / 60).toFixed(2)).toString();
}

export function hoursInputToMinutes(hoursInput: string): number {
  const hours = parseFloat(hoursInput);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 60);
}
