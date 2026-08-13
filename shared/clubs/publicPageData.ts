import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { buildScheduleSummary, type ScheduleGroup, type OperatingHour } from "../reservations/operatingHours";

// Portado de src/lib/clubPublicPageData.ts (app web) — mismas 4 queries en
// paralelo (canchas activas, horario, conteo de jugadores activos,
// noticias recientes), mismo shape de retorno. WEB re-exporta esta misma
// función bajo su nombre histórico para que ningún import existente
// cambie; mobile la usa directo para el nuevo tab "Página del club" del
// PLAYER (equivalente nativo de /[club]/home).

export const RECENT_NEWS_LIMIT = 3;

export type Court = {
  id: string;
  name: string;
  is_indoor: boolean | null;
  surface: string | null;
  streaming_url: string | null;
};

export type ClubNewsCard = {
  id: string;
  slug: string;
  title: string;
  content: string;
  image_url: string;
  published_at: string;
};

export interface ClubPublicPageData {
  courts: Court[];
  schedule: ScheduleGroup[];
  playerCount: number;
  news: ClubNewsCard[];
}

export async function getClubPublicPageData(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<ClubPublicPageData> {
  const [courtsResult, hoursResult, playerCountResult, newsResult] = await Promise.all([
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
    supabase
      .from("club_news")
      .select("id, slug, title, content, image_url, published_at")
      .eq("club_id", clubId)
      .order("published_at", { ascending: false })
      .limit(RECENT_NEWS_LIMIT),
  ]);

  return {
    courts: (courtsResult.data ?? []) as unknown as Court[],
    schedule: buildScheduleSummary((hoursResult.data ?? []) as unknown as OperatingHour[]),
    playerCount: (playerCountResult.data as number | null) ?? 0,
    news: (newsResult.data ?? []) as unknown as ClubNewsCard[],
  };
}
