// Comercial v2 / Fase 2 — Entitlement. Fuente única de los mensajes por rol
// cuando el backend rechaza la CREACIÓN de una reserva o un torneo por
// estado comercial `suspended` (ver CLAUDE.md → Commercial Access &
// Entitlement Principles). El resultado de negocio (permitido/bloqueado)
// se deriva exclusivamente server-side (`get_club_commercial_access`,
// `_require_commercial_access`) — este archivo solo resuelve copy, nunca
// re-decide la regla.
//
// Reutilizado por WEB (reservas PLAYER/OWNER/ADMIN, torneos OWNER/ADMIN) y
// Mobile (reservas PLAYER) — el mismo código de error, el mismo texto por
// rol, en ambas plataformas.

// SQLSTATE que _require_commercial_access levanta cuando el club está
// `suspended` — ver 20261115000006_commercial_entitlement.sql. Nunca se
// levanta por ningún otro estado (no-subscription/trialing/active
// permiten; past_due/cancelled quedan sin decisión explícita todavía, ver
// esa migración).
export const COMMERCIAL_ACCESS_DENIED_CODE = "P0008";

export const PLAYER_COMMERCIAL_BLOCKED_TITLE = "Reservas temporalmente no disponibles";

// PLAYER nunca debe ver deuda/factura/precio/pago/Wompi/suscripción vencida
// — mensaje deliberadamente neutral, nunca culpa al club.
export const PLAYER_COMMERCIAL_BLOCKED_MESSAGE =
  "En este momento el agendamiento de canchas no está disponible en este club. Para realizar una reserva, comunícate directamente con el club.";

// OWNER sí puede recibir contexto comercial explícito — sin CTA de pago
// todavía porque Wompi no existe (ver CLAUDE.md → Commercial Subscription
// Principles); cuando exista un destino real de reactivación, este mensaje
// es el único lugar que debería cambiar para agregarlo.
export const OWNER_COMMERCIAL_BLOCKED_MESSAGE =
  "La suscripción del club no está activa. Para crear nuevas reservas o torneos, reactiva la suscripción.";

// ADMIN no paga — nunca mencionar pago/suscripción como algo que le
// corresponde resolver a él, solo remitirlo al OWNER.
export const ADMIN_COMMERCIAL_BLOCKED_MESSAGE =
  "Algunas funciones están temporalmente deshabilitadas porque la suscripción del club no está activa. Comunícate con el propietario del club.";

export function getCommercialBlockedMessage(role: string | null | undefined): string {
  if (role === "OWNER") return OWNER_COMMERCIAL_BLOCKED_MESSAGE;
  if (role === "ADMIN") return ADMIN_COMMERCIAL_BLOCKED_MESSAGE;
  return PLAYER_COMMERCIAL_BLOCKED_MESSAGE;
}
