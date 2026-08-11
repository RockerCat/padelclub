import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Llama directamente a get_reservation_share_detail (misma RPC
// SECURITY DEFINER que ReservationShareView.tsx usa en la web — ver
// supabase/migrations/20261105000001_expire_pending_reservations.sql,
// última definición vigente de la función) en vez de reconstruir a mano un
// subconjunto de sus datos: así el detalle en RN lee exactamente la misma
// fuente que el detalle en la web (mismo is_creator/can_manage/
// am_participant/players/player_count/my_request), sin una segunda
// implementación parcial que pueda desviarse.
export type ReservationShareDetail = {
  reservation: {
    id: string;
    status: "pending" | "confirmed" | "cancelled" | "rejected" | "expired";
    is_open: boolean;
    date: string;
    start_time: string;
    duration_minutes: number;
    type: string;
    court_name: string | null;
    created_by: string;
    creator_name: string | null;
    is_creator: boolean;
    price_amount: number | null;
    price_currency: string | null;
  };
  club: { id: string; name: string; slug: string };
  can_manage: boolean;
  player_count: number;
  players: Array<{ profile_id: string; full_name: string | null; avatar_url: string | null; category: string | null }>;
  my_request: { id: string; status: string } | null;
  am_participant: boolean;
  has_schedule_conflict: boolean;
};

export type ReservationShareDetailResult =
  | { data: ReservationShareDetail; error: null }
  | { data: null; error: "not_found" | "not_authorized" | "unknown" };

export async function getReservationShareDetail(
  supabase: SupabaseClient<Database>,
  reservationId: string
): Promise<ReservationShareDetailResult> {
  const { data, error } = await supabase.rpc("get_reservation_share_detail", { p_reservation_id: reservationId });

  if (error) {
    if (error.code === "P0002") return { data: null, error: "not_found" };
    if (error.code === "42501") return { data: null, error: "not_authorized" };
    return { data: null, error: "unknown" };
  }

  return { data: data as unknown as ReservationShareDetail, error: null };
}
