// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). Misma fuente única
// que src/lib/durations.ts (app web) también usa
// (shared/reservations/durations.ts).
export * from "../../../shared/reservations/durations";
