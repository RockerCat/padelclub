// OperatingHour/DEFAULT_OPERATING_HOURS/timeToMinutes/getEffectiveHour/
// ScheduleGroup/buildScheduleSummary ya NO son una copia — Metro ahora
// resuelve shared/ fuera de la raíz de mobile/ (ver mobile/metro.config.js,
// watchFolders). Misma fuente única que src/lib/operatingHours.ts (app
// web) también usa (shared/reservations/operatingHours.ts).
export {
  type OperatingHour,
  DEFAULT_OPERATING_HOURS,
  DAY_NAMES,
  timeToMinutes,
  getEffectiveHour,
  type ScheduleGroup,
  buildScheduleSummary,
} from "../../../shared/reservations/operatingHours";

import type { OperatingHour } from "../../../shared/reservations/operatingHours";
import { getEffectiveHour, timeToMinutes } from "../../../shared/reservations/operatingHours";

// computeAvailableMinutesForRange es específico de Inicio/Estadísticas
// (OwnerDashboardScreen) — fuera del alcance de la migración de
// Reservaciones a shared/, se queda aquí tal cual, solo que ahora usa el
// timeToMinutes/getEffectiveHour compartidos en vez de una copia local.
export function computeAvailableMinutesForRange(hours: OperatingHour[], startDate: Date, endDate: Date): number {
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
