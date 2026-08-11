// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). El contenido
// canónico vive en shared/types/database.ts, la misma fuente que
// src/types/database.ts (app web) re-exporta. Este archivo es un
// re-export puro para que cada import existente de "../types/database" /
// "../../types/database" en mobile siga resolviendo exactamente igual —
// cero sitios de importación tuvieron que cambiar.
export * from "../../../shared/types/database";
