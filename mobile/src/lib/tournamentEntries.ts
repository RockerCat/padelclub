// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). Misma fuente única
// que src/lib/tournamentEntries.ts (app web) también usa
// (shared/tournaments/entries.ts).
export * from "../../../shared/tournaments/entries";
