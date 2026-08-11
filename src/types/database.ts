// Contenido canónico movido a shared/types/database.ts — la misma salida
// cruda de `npm run types:generate` (ver scripts/generate-types.sh, que
// ahora escribe ahí directamente) más el re-export de ./domain que ese
// script sigue re-adjuntando automáticamente. Este archivo es un
// re-export puro para que cada import existente de "@/types/database" en
// la web siga resolviendo exactamente igual (Database, Json, Tables<>,
// Constants y, transitivamente, todo lo de domain.ts) — cero sitios de
// importación tuvieron que cambiar.
export * from "../../shared/types/database";
