// Contenido canónico movido a shared/reservations/pricing.ts — la misma
// fuente que mobile ahora también usa (antes tenía una segunda copia
// manual de este mismo algoritmo). Re-export puro para que ningún import
// existente de "@/lib/reservationPricing" tenga que cambiar.
export * from "../../shared/reservations/pricing";
