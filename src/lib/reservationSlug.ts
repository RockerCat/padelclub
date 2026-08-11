// Contenido canónico movido a shared/reservations/slug.ts — la misma
// fuente que mobile ahora también usa (mobile solo necesita
// slugifyNamePart/buildReservationSlug; extractReservationId/
// parseShortReservationSlug son de uso exclusivo de WEB, pero viven en
// shared igual, ver el comentario en ese archivo). Re-export puro para
// que ningún import existente de "@/lib/reservationSlug" tenga que
// cambiar.
export * from "../../shared/reservations/slug";
