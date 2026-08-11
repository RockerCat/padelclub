// Mapeo único código de error → mensaje en español para
// public.update_reservation — portado de src/lib/reservationErrors.ts
// (app web). Reutilizado por la acción PLAYER, la acción OWNER/ADMIN y
// mobile, para que ninguna de las tres divergiera en la redacción de un
// mismo fallo del RPC. Nunca muestra un error crudo de Postgres/PostgREST
// al usuario.
export function mapUpdateReservationError(error: { code?: string | null; message?: string | null }): string {
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
    case "P0005":
      return "Este club se encuentra archivado.";
    // update_reservation_admin (20261106000001 + enforcement de reservas
    // pasadas): la propia RPC ya rechazó un cambio de cancha/fecha/hora/
    // duración/tipo sobre una reserva que ya terminó — su mensaje llega
    // listo en español, igual que P0003 arriba.
    case "P0006":
      return error.message || "Esta reserva ya pasó — solo puedes editar título, notas y jugadores.";
    default:
      return "Error al guardar los cambios. Intenta de nuevo.";
  }
}
