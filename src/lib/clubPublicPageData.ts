import type { SupabaseClient } from "@supabase/supabase-js";
import { buildScheduleSummary, type OperatingHour as Hour, type ScheduleGroup } from "@/lib/operatingHours";
import type { Court } from "@/components/clubs/ClubPublicView";

export interface ClubPublicPageData {
  courts: Court[];
  schedule: ScheduleGroup[];
  playerCount: number;
}

// Single source of truth for the courts/hours/player-count dataset that feeds
// ClubPublicView — used by both the real public page (/clubs/[slug]) and the
// owner's Vista Previa (/[club]/admin/public-page), so neither route can drift
// from the other by fetching a different shape of data.
export async function getClubPublicPageData(
  supabase: SupabaseClient,
  clubId: string
): Promise<ClubPublicPageData> {
  const [courtsResult, hoursResult, playerCountResult] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name, is_indoor, surface, streaming_url")
      .eq("club_id", clubId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", clubId)
      .order("day_of_week"),
    supabase.rpc("count_active_players", { p_club_id: clubId }),
  ]);

  return {
    courts: (courtsResult.data ?? []) as Court[],
    schedule: buildScheduleSummary((hoursResult.data ?? []) as Hour[]),
    playerCount: playerCountResult.data ?? 0,
  };
}
