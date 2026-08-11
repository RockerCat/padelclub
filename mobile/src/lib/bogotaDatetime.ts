// getBogotaNow/bogotaWallClockToISO/isoToBogotaWallClock ya NO son una
// copia — Metro ahora resuelve shared/ fuera de la raíz de mobile/ (ver
// mobile/metro.config.js, watchFolders). El contenido canónico vive en
// shared/utils/bogotaDatetime.ts, la misma fuente que
// src/lib/utils/bogotaDatetime.ts (app web) re-exporta — mismo mecanismo
// exacto (Intl.DateTimeFormat con America/Bogota) en ambas plataformas,
// nunca dos implementaciones que puedan divergir de nuevo como pasó antes
// de esa corrección.
export * from "../../../shared/utils/bogotaDatetime";

import { isoToBogotaWallClock } from "../../../shared/utils/bogotaDatetime";

// Único helper que sigue siendo solo de mobile: el formulario de creación
// de torneos captura fecha/hora en un TextInput de texto libre (RN no
// tiene <input type="datetime-local">), con espacio en vez de "T" — ver
// TournamentFormModal.tsx. No hay equivalente en WEB que compartir.
export function getBogotaWallClockNow(): string {
  return isoToBogotaWallClock(new Date().toISOString()).replace("T", " ");
}
