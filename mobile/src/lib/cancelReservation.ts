import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de cancelMyReservation en src/app/(app)/[club]/reservations/actions.ts
// (app web) — mismas dos RPCs (cancel_reservation, luego
// notify_reservation_cancelled best-effort), mismo mapeo de códigos de
// error. La web envuelve esto en un Server Action solo por el
// revalidatePath final (irrelevante en RN, donde el caller simplemente
// vuelve a pedir los datos) — la autorización real vive en las RPCs mismas
// (SECURITY DEFINER), así que llamarlas directo desde el cliente RN es
// exactamente tan seguro como desde el Server Action web.
export type CancelReservationResult = { success?: boolean; error?: string };

export async function cancelReservation(
  supabase: SupabaseClient<Database>,
  reservationId: string
): Promise<CancelReservationResult> {
  const { error } = await supabase.rpc("cancel_reservation", { p_reservation_id: reservationId });

  if (error) {
    if (error.code === "23514") return { error: "No puedes cancelar con menos de 2 horas de anticipación." };
    if (error.code === "22023") return { error: "Esta reserva ya no se puede cancelar." };
    if (error.code === "P0002") return { error: "Reserva no encontrada." };
    if (error.code === "42501") return { error: "No tienes permiso para cancelar esta reserva." };
    return { error: "Error al cancelar la reserva. Intenta nuevamente." };
  }

  // Best-effort, igual que en la web — la cancelación ya se aplicó y no se
  // revierte por un fallo aquí.
  await supabase.rpc("notify_reservation_cancelled", { p_reservation_id: reservationId });

  return { success: true };
}
