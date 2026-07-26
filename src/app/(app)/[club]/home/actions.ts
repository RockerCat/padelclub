"use server";

import { createClient } from "@/lib/supabase/server";

export type LeaveClubResult = { success?: boolean; error?: string };

// PLAYER-only voluntary leave (Phase 5). Everything that determines
// whether this is allowed — account_type, membership role/activity,
// which reservations get cancelled — is re-derived server-side inside the
// leave_club RPC from auth.uid(); this action passes nothing but the
// club id. leave_club itself reuses cancel_reservation (Phase 4) for
// every affected reservation, so this action never touches reservation
// state directly.
export async function leaveClub(clubId: string): Promise<LeaveClubResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión para salir del club." };

  const { error } = await supabase.rpc("leave_club", { p_club_id: clubId });

  if (error) {
    if (error.code === "23514") {
      return {
        error:
          "No puedes salir del club en este momento: tienes una reserva que comienza en menos de 2 horas. Espera a que finalice o pide a un administrador que la cancele, e inténtalo de nuevo.",
      };
    }
    if (error.code === "22023") return { error: "Ya no perteneces a este club." };
    if (error.code === "P0002") return { error: "No perteneces a este club." };
    if (error.code === "42501") return { error: "No tienes permiso para realizar esta acción." };
    console.error("[leaveClub] leave_club failed:", { clubId, supabaseError: error });
    return { error: "Error al salir del club. Intenta nuevamente." };
  }

  return { success: true };
}
