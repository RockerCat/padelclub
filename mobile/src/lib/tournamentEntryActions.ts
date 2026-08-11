// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). Misma fuente única
// que src/lib/tournamentEntryActions.ts (app web) también usa
// (shared/tournaments/entryActions.ts).
//
// Corrección real encontrada al consolidar: la copia anterior de este
// archivo en mobile tenía varias condiciones `msg.includes(...)` en
// tournamentEntryErrorMessage que NO coincidían con el texto real que las
// funciones SQL lanzan (reconstruidas a mano en vez de copiadas
// literalmente — p. ej. comparaba con "no longer accepting"/"superior
// category"/mayúsculas distintas que nunca aparecían en el mensaje real),
// cayendo siempre al mensaje genérico "Datos inválidos." en esos casos.
// La fuente compartida ahora tiene las condiciones exactas verificadas
// contra el archivo real de WEB.
export * from "../../../shared/tournaments/entryActions";
