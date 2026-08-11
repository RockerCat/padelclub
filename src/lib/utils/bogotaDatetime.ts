// Contenido canónico movido a shared/utils/bogotaDatetime.ts — la misma
// hora de pared de Bogotá (Intl.DateTimeFormat, nunca un offset fijo a
// mano) que WEB y mobile ya comparten desde que el bug de timezone de
// getAvailableSlots se corrigió acá (ver CLAUDE.md). Re-export puro para
// que "@/lib/utils/bogotaDatetime" siga resolviendo igual — cero sitios
// de importación tuvieron que cambiar.
export * from "../../../shared/utils/bogotaDatetime";
