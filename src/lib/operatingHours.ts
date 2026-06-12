export type OperatingHour = {
  day_of_week: number; // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  is_open: boolean;
  opens_at: string | null;  // "HH:MM" or "HH:MM:SS"
  closes_at: string | null;
};

// Defaults applied when a club has no configured hours for a day
export const DEFAULT_OPERATING_HOURS: OperatingHour[] = [
  { day_of_week: 0, is_open: false, opens_at: null,    closes_at: null    }, // Domingo
  { day_of_week: 1, is_open: true,  opens_at: "06:00", closes_at: "22:00" }, // Lunes
  { day_of_week: 2, is_open: true,  opens_at: "06:00", closes_at: "22:00" }, // Martes
  { day_of_week: 3, is_open: true,  opens_at: "06:00", closes_at: "22:00" }, // Miércoles
  { day_of_week: 4, is_open: true,  opens_at: "06:00", closes_at: "22:00" }, // Jueves
  { day_of_week: 5, is_open: true,  opens_at: "06:00", closes_at: "22:00" }, // Viernes
  { day_of_week: 6, is_open: true,  opens_at: "08:00", closes_at: "18:00" }, // Sábado
];

export function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function getEffectiveHour(dbHours: OperatingHour[], dayOfWeek: number): OperatingHour {
  return (
    dbHours.find((h) => h.day_of_week === dayOfWeek) ??
    DEFAULT_OPERATING_HOURS.find((h) => h.day_of_week === dayOfWeek)!
  );
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
