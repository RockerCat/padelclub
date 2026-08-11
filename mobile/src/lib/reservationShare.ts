// buildReservationShareMessage ya NO es una copia — Metro ahora resuelve
// shared/ fuera de la raíz de mobile/ (ver mobile/metro.config.js,
// watchFolders). Misma fuente única que src/lib/reservationShare.ts (app
// web) también usa (shared/reservations/share.ts).
export { buildReservationShareMessage } from "../../../shared/reservations/share";

// SITE_URL sigue siendo solo de mobile: en WEB cada caller arma su propio
// `url` con window.location.origin (el navegador siempre conoce su propio
// origen); mobile no tiene ese concepto (app nativa) y necesita esta
// constante para poder construir el mismo parámetro `url` que
// buildReservationShareMessage recibe como input puro — no es una regla
// de negocio duplicada, es infraestructura específica de esta plataforma.
export const SITE_URL = "https://mipadel.club"; // igual a SITE_URL en src/app/layout.tsx (app web)
