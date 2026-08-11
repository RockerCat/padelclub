// computeAvailability ya NO es una copia — Metro ahora resuelve shared/
// fuera de la raíz de mobile/ (ver mobile/metro.config.js, watchFolders).
// Misma fuente única que src/lib/courtDayAvailability.ts (app web)
// también usa (shared/reservations/availability.ts).
export type { RawReservation, BlockedByDate, CourtDayAvailability } from "../../../shared/reservations/availability";
export { computeAvailability } from "../../../shared/reservations/availability";
