import type { MyReservation } from "./playerReservations";
import { addMinutes } from "./operatingHours";

// Reglas de visibilidad/orden/elegibilidad de cancelación — extraídas de
// src/components/reservations/PlayerActivity.tsx (app web), donde vivían
// como funciones puras exportadas junto al componente. El componente en sí
// (JSX, hooks, ConfirmDialog) se queda en WEB — nunca se comparten
// componentes React — pero esta lógica no tiene ninguna dependencia de
// React y es exactamente la misma regla que mobile necesitaba portar a
// mano antes.
//
// Nota de paridad de zona horaria: estas funciones comparan contra
// `Date.now()`/`new Date(...)` en la hora local del dispositivo/navegador
// que las ejecuta — NO usan getBogotaNow(). A diferencia del bug real ya
// corregido en getAvailableSlots (que corría en el servidor de Next.js,
// UTC), esta lógica siempre corre client-side (un componente "use client"
// en WEB, el propio dispositivo en mobile), así que ambas plataformas ya
// reflejan la hora real de quien mira la pantalla — mismo comportamiento
// que ya existía antes de esta migración, intencionalmente preservado tal
// cual (ver reporte: candidato para un endurecimiento de timezone futuro,
// no un bug confirmado).

// Si una reserva todavía tiene valor operativo para el panel — pending
// (aún en proceso) y rejected (historial reciente, descartable) siempre
// califican; una aprobada/confirmada solo califica mientras no haya
// terminado. Compara fecha+hora de fin completas, nunca solo la fecha.
export function isReservationActive(r: MyReservation): boolean {
  if (r.status === "pending" || r.status === "rejected") return true;
  if (r.status !== "confirmed") return false;
  const endTime = addMinutes(r.start_time.slice(0, 5), r.duration_minutes);
  const endDate = new Date(`${r.date}T${endTime}:00`);
  return endDate.getTime() > Date.now();
}

// Si una reserva confirmada (ya activa, según isReservationActive) ya
// empezó — usado solo para ordenar ("en curso" primero), nunca para
// decidir visibilidad.
function isReservationInProgress(r: MyReservation): boolean {
  const startDate = new Date(`${r.date}T${r.start_time.slice(0, 5)}:00`);
  return startDate.getTime() <= Date.now();
}

// Orden de "Mis reservas": las que ya están en curso primero, luego las
// próximas más cercanas primero — una ya terminada nunca aparece
// (isReservationActive). Misma regla, mismo orden en "Mis próximas
// reservas" de la home del jugador.
export function sortBookingsByProximity(bookings: MyReservation[]): MyReservation[] {
  return bookings
    .filter(isReservationActive)
    .slice()
    .sort((a, b) => {
      const aRank = isReservationInProgress(a) ? 0 : 1;
      const bRank = isReservationInProgress(b) ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      const aStart = new Date(`${a.date}T${a.start_time.slice(0, 5)}:00`).getTime();
      const bStart = new Date(`${b.date}T${b.start_time.slice(0, 5)}:00`).getTime();
      return aStart - bStart;
    });
}

// Visibilidad de "Mis solicitudes": pending siempre se muestra (aún en
// proceso); rejected solo mientras no se haya descartado localmente.
// approved nunca pertenece aquí — ya se muestra como reserva
// (sortBookingsByProximity) en cuanto se confirma.
export function filterVisibleRequests(myReservations: MyReservation[], dismissedIds: Set<string>): MyReservation[] {
  return myReservations.filter((r) => r.status !== "rejected" || !dismissedIds.has(r.id));
}

// Puramente un gate de UX client-side para mostrar/ocultar "Cancelar" —
// el cumplimiento real de la regla de 2 horas vive server-side en la RPC
// cancel_reservation, que nunca confía en esto. Solo pending/confirmed
// son cancelables por un PLAYER (rejected/cancelled son estados
// terminales); el chequeo real de creador-o-participante también ocurre
// server-side. Toma un Pick (no el MyReservation completo) para que
// cualquier forma de reserva con status/date/start_time pueda reutilizar
// exactamente este mismo gate en vez de una segunda copia de la regla de
// 2 horas.
export function canPlayerCancelReservation(r: Pick<MyReservation, "status" | "date" | "start_time">): boolean {
  if (r.status !== "pending" && r.status !== "confirmed") return false;
  const startDate = new Date(`${r.date}T${r.start_time.slice(0, 5)}:00`);
  return startDate.getTime() - Date.now() >= 2 * 60 * 60 * 1000;
}
