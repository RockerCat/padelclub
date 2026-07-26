// Shared error-code → Spanish message mapping for public.update_reservation
// (Phase 7) — reused by both the PLAYER-facing action
// (reservations/actions.ts) and the OWNER/ADMIN action
// (admin/reservations/actions.ts) so the two surfaces never drift into
// different wording for the same RPC failure. Never shows a raw
// Postgres/PostgREST error to the user.
export function mapUpdateReservationError(error: { code?: string | null }): string {
  switch (error.code) {
    case "42501":
      return "No tienes permiso para editar esta reserva.";
    case "P0002":
      return "La reserva o la cancha seleccionada ya no está disponible.";
    case "22023":
      return "Esta reserva ya no se puede editar (fue cancelada, rechazada o modificada).";
    case "23514":
      return "No puedes editar con menos de 2 horas de anticipación.";
    case "23P01":
      return "Ese horario ya está ocupado. Selecciona otro.";
    case "P0003":
      return "El nuevo horario no es válido (duración, horario del club, fecha pasada o tarifa no configurada).";
    default:
      return "Error al guardar los cambios. Intenta de nuevo.";
  }
}
