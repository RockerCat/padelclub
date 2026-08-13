// RECENT_NEWS_LIMIT/getClubPublicPageData ya NO se definen aquí — viven en
// shared/clubs/publicPageData.ts (misma fuente que ahora también usa
// mobile, para el tab "Página del club" del PLAYER), re-exportados bajo
// estos mismos nombres para que ningún import existente de
// "@/lib/clubPublicPageData" tenga que cambiar. `ClubPublicPageData` sigue
// definida localmente, tipada contra los Court/ClubNewsCard históricos de
// ClubPublicView.tsx (estructuralmente idénticos a los de shared/) para no
// tocar ningún otro import de esos dos tipos en el resto de la app web.
export { RECENT_NEWS_LIMIT, getClubPublicPageData } from "../../shared/clubs/publicPageData";

import type { Court, ClubNewsCard } from "@/components/clubs/ClubPublicView";
import type { ScheduleGroup } from "@/lib/operatingHours";

export interface ClubPublicPageData {
  courts: Court[];
  schedule: ScheduleGroup[];
  playerCount: number;
  news: ClubNewsCard[];
}
