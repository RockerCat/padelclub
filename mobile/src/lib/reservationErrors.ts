// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). Misma fuente única
// que src/lib/reservationErrors.ts (app web) también usa
// (shared/reservations/errors.ts).
export * from "../../../shared/reservations/errors";
