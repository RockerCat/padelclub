// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). Misma fuente única
// que src/lib/reservationRejection.ts (app web) también usa
// (shared/reservations/rejection.ts).
export * from "../../../shared/reservations/rejection";
