import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Single source of truth for the shape returned by public.get_club_statistics
// (20260816000001_club_statistics.sql) — every field here is computed
// server-side, from real reservations rows, never approximated and never
// downloaded raw to compute in the browser. No monetary field exists on
// purpose: price_amount is NULL for most admin-created reservations and for
// any request with no matching tariff, so no honest "revenue" aggregate is
// possible with the current model (see the migration's header comment).

export interface ClubStatisticsSummary {
  totalReservations: number;
  matchReservations: number;
  classReservations: number;
  confirmed: number;
  pending: number;
  cancelledOrRejected: number;
  reservedMinutes: number;
  reservedHours: number;
  dailyAverage: number;
  confirmationRate: number;
}

export interface ClubStatisticsPreviousSummary {
  totalReservations: number;
  confirmed: number;
  pending: number;
  cancelledOrRejected: number;
  reservedMinutes: number;
}

export interface ClubStatisticsTimelinePoint {
  date: string; // bucket start (day, or Monday of the week for weekly buckets)
  count: number;
}

export interface ClubStatisticsStatusPoint {
  status: "confirmed" | "pending" | "cancelled" | "rejected";
  label: string;
  count: number;
}

export interface ClubStatisticsCourtUsage {
  id: string;
  name: string;
  reservationCount: number;
  reservedMinutes: number;
}

export interface ClubStatisticsWeekdayPoint {
  weekday: number; // 1=Monday .. 7=Sunday (ISO)
  label: string;
  count: number;
  reservedMinutes: number;
}

export interface ClubStatisticsHourlyPoint {
  hour: number;
  label: string;
  count: number;
}

export interface ClubStatistics {
  period: { start: string; end: string; days: number };
  timelineGranularity: "day" | "week";
  summary: ClubStatisticsSummary;
  previousSummary: ClubStatisticsPreviousSummary;
  timeline: ClubStatisticsTimelinePoint[];
  statuses: ClubStatisticsStatusPoint[];
  courts: ClubStatisticsCourtUsage[];
  weekdays: ClubStatisticsWeekdayPoint[];
  hourlySlots: ClubStatisticsHourlyPoint[];
}

export type ClubStatisticsResult =
  | { data: ClubStatistics; error: null }
  | { data: null; error: string };

// Thin wrapper around the RPC — authorization (OWNER/ADMIN, active
// membership, archived-club-still-readable) happens entirely inside
// get_club_statistics itself; this never trusts a role passed in.
export async function getClubStatistics(
  supabase: SupabaseClient<Database>,
  clubId: string,
  startDate: string,
  endDate: string
): Promise<ClubStatisticsResult> {
  const { data, error } = await supabase.rpc("get_club_statistics", {
    p_club_id: clubId,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error || !data) {
    return { data: null, error: "No se pudieron cargar las estadísticas. Intenta nuevamente." };
  }

  return { data: data as unknown as ClubStatistics, error: null };
}
