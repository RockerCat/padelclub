import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapUpdateReservationError } from "./reservationErrors";
import { syncReservationPlayers } from "../../../shared/reservations/playerSync";

// Portado de createReservation en
// src/app/(app)/[club]/admin/reservations/actions.ts (app web) — misma RPC
// exacta (create_reservation_admin, con p_player_count para que la propia
// RPC decida "4+ jugadores siempre fuerza Cerrada" en vez de confiar solo
// en isOpen), mismo insert en reservation_players tras crear, y misma
// notificación best-effort (notify_reservation_created_for_players). Antes
// este slice omitía por completo el insert de jugadores — checkedPlayers
// en WeekReservationModal solo se usaba para decidir isOpen client-side, y
// los jugadores marcados nunca quedaban persistidos: la reserva se
// guardaba, pero al reabrirla para editar el formulario mostraba 0
// jugadores seleccionados porque reservation_players nunca tuvo filas.
export type ReservationMutationResult = { success?: boolean; reservationId?: string; error?: string };

export async function createReservationAdmin(
  supabase: SupabaseClient<Database>,
  params: {
    clubId: string;
    courtId: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    type: string;
    title: string | null;
    isOpen: boolean;
    playerIds: string[];
  }
): Promise<ReservationMutationResult> {
  const { data, error } = await supabase.rpc("create_reservation_admin", {
    p_club_id: params.clubId,
    p_court_id: params.courtId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_duration_minutes: params.durationMinutes,
    p_type: params.type,
    p_title: params.title,
    p_notes: null,
    p_is_open: params.isOpen,
    p_player_count: params.playerIds.length,
  });

  if (error) return { error: mapUpdateReservationError(error) };
  const reservationId = data as string;

  if (params.playerIds.length > 0) {
    const { error: playersError } = await supabase
      .from("reservation_players")
      .insert(params.playerIds.map((profileId) => ({ reservation_id: reservationId, profile_id: profileId })));

    if (playersError) {
      console.error("[createReservationAdmin] reservation_players insert failed:", { reservationId, playersError });
      // La reserva ya se creó; no se bloquea por un fallo del insert de
      // jugadores, mismo criterio que la web.
    } else {
      const { error: notifyError } = await supabase.rpc("notify_reservation_created_for_players", {
        p_reservation_id: reservationId,
      });
      if (notifyError) {
        console.error("[createReservationAdmin] notify_reservation_created_for_players failed:", { reservationId, notifyError });
      }
    }
  }

  return { success: true, reservationId };
}

// Portado de la updateReservation ampliada en actions.ts (app web) — misma
// RPC exacta (update_reservation_admin, 20261106000001: un producto-scope
// real, OWNER/ADMIN ahora también edita tipo/título/notas, nunca creador/
// club/estado/precio/is_open), y mismo sync de jugadores vía
// shared/reservations/playerSync.ts (agregar/quitar/conservar, la misma
// función que la web llama — nunca una segunda implementación del diff).
// update_reservation (la RPC vieja, sin estos campos) sigue intacta para
// el flujo PLAYER (updateMyReservation en reservationMutations.ts), que
// esta función nunca toca.
export async function updateReservationAdmin(
  supabase: SupabaseClient<Database>,
  reservationId: string,
  params: {
    courtId: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    type: string;
    title: string | null;
    notes: string | null;
    playerIds: string[];
  }
): Promise<ReservationMutationResult> {
  const { error } = await supabase.rpc("update_reservation_admin", {
    p_reservation_id: reservationId,
    p_court_id: params.courtId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_duration_minutes: params.durationMinutes,
    p_type: params.type,
    p_title: params.title,
    p_notes: params.notes,
  });

  if (error) return { error: mapUpdateReservationError(error) };

  const syncResult = await syncReservationPlayers(supabase, reservationId, params.playerIds);
  if (syncResult.error) return { error: syncResult.error };

  // Best-effort, misma convención que el resto del módulo — la reserva ya
  // se guardó y no se revierte por un fallo de notificación. Idempotente
  // (guard NOT EXISTS por jugador+reserva), así que solo alcanza a los
  // jugadores realmente agregados ahora.
  if (syncResult.added.length > 0) {
    const { error: notifyPlayersError } = await supabase.rpc("notify_reservation_created_for_players", {
      p_reservation_id: reservationId,
    });
    if (notifyPlayersError) {
      console.error("[updateReservationAdmin] notify_reservation_created_for_players failed:", { reservationId, notifyPlayersError });
    }
  }

  const { error: notifyError } = await supabase.rpc("notify_reservation_updated", { p_reservation_id: reservationId });
  if (notifyError) {
    console.error("[updateReservationAdmin] notify_reservation_updated failed:", { reservationId, notifyError });
  }

  return { success: true, reservationId };
}
