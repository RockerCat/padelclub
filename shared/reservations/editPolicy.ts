import { getBogotaNow } from "../utils/bogotaDatetime";
import { timeToMinutes } from "./operatingHours";

// Única fuente de verdad para "qué se puede editar/hacer sobre una reserva
// según su estado temporal" — consumida igual por ReservationForm/
// WeekReservationModal (formulario de edición) y ReservationTicketPanel
// (WEB y mobile), y por ReservationShareView (WEB, que reutiliza los
// mismos componentes/acciones). Nunca se recalcula por plataforma: cada
// caller le pasa la fecha/hora/duración reales de la reserva y el "ahora"
// canónico (getBogotaNow — America/Bogota vía Intl, nunca `new Date()`
// crudo, que refleja la zona del proceso/dispositivo en vez de la del
// club) y recibe exactamente los mismos campos/acciones habilitados en
// ambas plataformas.
export type ReservationTimeStatus = "future" | "ongoing" | "past";

export type BogotaNow = { dateStr: string; minutesOfDay: number };

// future: aún no empieza. ongoing: el horario reservado (start..start+duration)
// contiene el momento actual. past: ya terminó — el único de los tres que
// esta regla usa para restringir algo; "ongoing" se trata igual que
// "future" (comportamiento actual, sin restricciones nuevas) hasta que se
// revise explícitamente qué acciones tienen sentido durante el partido.
export function getReservationTimeStatus(
  date: string,
  startTime: string,
  durationMinutes: number,
  now: BogotaNow
): ReservationTimeStatus {
  if (date > now.dateStr) return "future";
  if (date < now.dateStr) return "past";

  const startMins = timeToMinutes(startTime);
  const endMins = startMins + durationMinutes;
  if (now.minutesOfDay < startMins) return "future";
  if (now.minutesOfDay < endMins) return "ongoing";
  return "past";
}

export type ReservationEditableFields = {
  court: boolean;
  date: boolean;
  startTime: boolean;
  duration: boolean;
  type: boolean;
  title: boolean;
  notes: boolean;
  players: boolean;
};

export type ReservationOperationalActions = {
  /** Abrir/Cerrar reserva (set_reservation_open_status). */
  toggleOpen: boolean;
  cancel: boolean;
  addExtraTime: boolean;
  /** Aprobar/rechazar solicitudes de unión pendientes — mismo motivo que
   *  toggleOpen: una vez pasada la reserva, no tiene sentido operativo
   *  seguir resolviendo quién se une a un partido que ya ocurrió. */
  manageJoinRequests: boolean;
};

export type ReservationEditPolicy = {
  timeStatus: ReservationTimeStatus;
  fields: ReservationEditableFields;
  actions: ReservationOperationalActions;
};

const FULL_FIELDS: ReservationEditableFields = {
  court: true,
  date: true,
  startTime: true,
  duration: true,
  type: true,
  title: true,
  notes: true,
  players: true,
};

// Reserva pasada: preservar el histórico (cancha/fecha/hora/duración/tipo
// congelados) — solo título, notas y jugadores siguen abiertos a
// corrección administrativa. reservation_players no pasa por esta regla
// (se sincroniza vía syncReservationPlayers, sin restricción temporal en
// RLS) — `players: true` aquí es la señal que ambos formularios usan para
// no deshabilitar esa sección.
const PAST_FIELDS: ReservationEditableFields = {
  court: false,
  date: false,
  startTime: false,
  duration: false,
  type: false,
  title: true,
  notes: true,
  players: true,
};

const FULL_ACTIONS: ReservationOperationalActions = {
  toggleOpen: true,
  cancel: true,
  addExtraTime: true,
  manageJoinRequests: true,
};

const PAST_ACTIONS: ReservationOperationalActions = {
  toggleOpen: false,
  cancel: false,
  addExtraTime: false,
  manageJoinRequests: false,
};

// "ongoing" se resuelve igual que "future" (política sin cambios) — ver
// comentario de getReservationTimeStatus arriba.
export function getReservationAdminEditPolicy(
  date: string,
  startTime: string,
  durationMinutes: number,
  now: BogotaNow
): ReservationEditPolicy {
  const timeStatus = getReservationTimeStatus(date, startTime, durationMinutes, now);
  const isPast = timeStatus === "past";
  return {
    timeStatus,
    fields: isPast ? PAST_FIELDS : FULL_FIELDS,
    actions: isPast ? PAST_ACTIONS : FULL_ACTIONS,
  };
}

// Conveniencia — el caso de uso más común (política respecto al momento
// real actual) sin que cada caller tenga que importar getBogotaNow aparte.
export function getReservationAdminEditPolicyNow(
  date: string,
  startTime: string,
  durationMinutes: number
): ReservationEditPolicy {
  return getReservationAdminEditPolicy(date, startTime, durationMinutes, getBogotaNow());
}
