// Misma fuente única que src/lib/deleteAccount.ts (app web) también usa
// (shared/account/deleteAccount.ts) — Metro resuelve shared/ fuera de la
// raíz de mobile/ (ver mobile/metro.config.js, watchFolders).
export * from "../../../shared/account/deleteAccount";
