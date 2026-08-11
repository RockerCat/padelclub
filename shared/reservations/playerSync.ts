import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Única fuente de verdad para "editar la lista de jugadores de una reserva
// ya existente" — WEB (updateReservation, admin/reservations/actions.ts) y
// mobile (updateReservationAdmin, reservationAdmin.ts) llaman exactamente
// esta misma función en vez de reimplementar el diff agregar/quitar/
// conservar cada uno por su lado. Reutiliza la misma RLS (INSERT/DELETE en
// reservation_players ya scopeada a OWNER/ADMIN del club de la reserva,
// 20260611000007_sprint3_reservations.sql) que la creación de reservas ya
// usa para su propio insert — no se agregó ninguna policy nueva.
//
// Nunca borra y vuelve a insertar todo: solo toca las filas que realmente
// cambian (added = seleccionados que no estaban, removed = los que estaban
// y ya no), así que un jugador que sigue marcado conserva su fila
// (created_at) intacta.
export type SyncReservationPlayersResult = {
  added: string[];
  removed: string[];
  error?: string;
};

export async function syncReservationPlayers(
  supabase: SupabaseClient<Database>,
  reservationId: string,
  newPlayerIds: string[]
): Promise<SyncReservationPlayersResult> {
  const { data: existingRows, error: readError } = await supabase
    .from("reservation_players")
    .select("profile_id")
    .eq("reservation_id", reservationId);

  if (readError) {
    return { added: [], removed: [], error: "No se pudo leer la lista actual de jugadores." };
  }

  const existingIds = new Set((existingRows ?? []).map((r) => r.profile_id));
  const newIds = new Set(newPlayerIds);
  const toAdd = newPlayerIds.filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !newIds.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("reservation_players")
      .delete()
      .eq("reservation_id", reservationId)
      .in("profile_id", toRemove);
    if (error) return { added: [], removed: [], error: "No se pudo actualizar la lista de jugadores." };
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("reservation_players")
      .insert(toAdd.map((profileId) => ({ reservation_id: reservationId, profile_id: profileId })));
    if (error) return { added: [], removed: [], error: "No se pudo actualizar la lista de jugadores." };
  }

  return { added: toAdd, removed: toRemove };
}
