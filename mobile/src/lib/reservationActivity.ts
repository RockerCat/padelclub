// isReservationActive/sortBookingsByProximity/filterVisibleRequests/
// canPlayerCancelReservation ya NO son una copia — Metro ahora resuelve
// shared/ fuera de la raíz de mobile/ (ver mobile/metro.config.js,
// watchFolders). Misma fuente única que
// src/components/reservations/PlayerActivity.tsx (app web) también usa
// (shared/reservations/eligibility.ts).
export {
  isReservationActive,
  sortBookingsByProximity,
  filterVisibleRequests,
  canPlayerCancelReservation,
} from "../../../shared/reservations/eligibility";
