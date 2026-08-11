import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapUpdateReservationError } from "./reservationErrors";

// Portado de requestReservation/updateMyReservation en
// src/app/(app)/[club]/reservations/actions.ts (app web) — mismas dos
// RPCs, mismo mapeo de errores. La web las envuelve en un Server Action
// solo por revalidatePath (irrelevante en RN); la autorización real vive
// en las RPCs (SECURITY DEFINER), igual que en cancelReservation.ts.
export type ReservationMutationResult = { success?: boolean; reservationId?: string; error?: string };

export async function requestReservation(
  supabase: SupabaseClient<Database>,
  params: { clubId: string; courtId: string; date: string; startTime: string; durationMinutes: number; isOpen: boolean }
): Promise<ReservationMutationResult> {
  const { data, error } = await supabase.rpc("create_reservation_player", {
    p_club_id: params.clubId,
    p_court_id: params.courtId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_duration_minutes: params.durationMinutes,
    p_is_open: params.isOpen,
  });

  if (error) return { error: mapUpdateReservationError(error) };

  const reservationId = data as string;
  await supabase.rpc("notify_reservation_request_created", { p_reservation_id: reservationId });

  return { success: true, reservationId };
}

export async function updateMyReservation(
  supabase: SupabaseClient<Database>,
  reservationId: string,
  params: { courtId: string; date: string; startTime: string; durationMinutes: number }
): Promise<ReservationMutationResult> {
  const { error } = await supabase.rpc("update_reservation", {
    p_reservation_id: reservationId,
    p_court_id: params.courtId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_duration_minutes: params.durationMinutes,
  });

  if (error) return { error: mapUpdateReservationError(error) };

  await supabase.rpc("notify_reservation_updated", { p_reservation_id: reservationId });

  return { success: true };
}
