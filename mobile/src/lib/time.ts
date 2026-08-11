// timeToMins/minsToTime/addMinutes/buildDayGrid ya NO son una copia —
// Metro ahora resuelve shared/ fuera de la raíz de mobile/ (ver
// mobile/metro.config.js, watchFolders). Misma fuente única que
// mobile/src/lib/operatingHours.ts y la app web ya usan
// (shared/reservations/operatingHours.ts), re-exportada bajo el alias
// histórico de este archivo (timeToMins) para que ningún import
// existente de "./time" tenga que cambiar.
export {
  timeToMinutes as timeToMins,
  minsToTime,
  addMinutes,
  buildDayGrid,
} from "../../../shared/reservations/operatingHours";
