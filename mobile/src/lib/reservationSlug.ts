// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). Misma fuente única
// que src/lib/reservationSlug.ts (app web) también usa
// (shared/reservations/slug.ts) — mobile solo necesita
// slugifyNamePart/buildReservationSlug (nunca navega por URL entrante).
export { slugifyNamePart, buildReservationSlug } from "../../../shared/reservations/slug";
