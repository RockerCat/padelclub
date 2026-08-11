// Estos 4 helpers ya NO se definen aquí — vivían duplicados frente a
// timeToMinutes/getEffectiveHour de operatingHours.ts (mismo cálculo,
// nombres distintos: timeToMins vs timeToMinutes). Ahora es la misma
// fuente única en shared/reservations/operatingHours.ts, re-exportada
// bajo estos nombres históricos (timeToMins) para que ningún import
// existente de "@/lib/courtAvailability" tenga que cambiar.
export {
  timeToMinutes as timeToMins,
  minsToTime,
  addMinutes,
  buildDayGrid,
} from "../../shared/reservations/operatingHours";
