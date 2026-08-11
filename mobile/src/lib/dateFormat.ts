// Formato de fecha compartido por la tarjeta de actividad y el detalle en
// la web ("mié 12 ago") — construido a mano con los mismos arreglos que
// ReservationShareView.tsx usa (nunca toLocaleDateString, para no depender
// de qué locales trae Hermes en cada plataforma).
export const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAY[dt.getDay()]} ${dt.getDate()} ${MONTH[dt.getMonth()]}`;
}

// "miércoles 12 de agosto" — equivalente a formatModalDate en
// PlayerAvailabilityCalendar.tsx (toLocaleDateString "es-MX", weekday
// long). Construido a mano (no toLocaleDateString) por la misma razón que
// formatShortDate — nunca depender de qué locales trae Hermes.
const WEEKDAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatModalDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAY_LONG[dt.getDay()]} ${dt.getDate()} de ${MONTH_LONG[dt.getMonth()]}`;
}
