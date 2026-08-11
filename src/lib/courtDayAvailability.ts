// computeAvailability ya NO se define aquí — vive en
// shared/reservations/availability.ts, la misma fuente que mobile ahora
// también usa. Re-export puro para que ningún import existente de
// "@/lib/courtDayAvailability" tenga que cambiar.
export type { RawReservation, BlockedByDate, CourtDayAvailability } from "../../shared/reservations/availability";
export { computeAvailability } from "../../shared/reservations/availability";
