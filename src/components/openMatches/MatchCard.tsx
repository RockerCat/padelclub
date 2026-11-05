import Link from "next/link";
import { MapPin, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  formatOpenMatchDay,
  formatOpenMatchTime,
  formatSpotsLeft,
  openMatchLevelLabel,
  openMatchPath,
  openMatchPlaceName,
  type OpenMatch,
} from "@/lib/openMatches";
import { MatchCourtBadge, MatchPhaseBadge, SpotsDots } from "./MatchBadges";

interface MatchCardProps {
  match: OpenMatch;
  /** YYYY-MM-DD en Bogotá, para "Hoy"/"Mañana". */
  today: string;
  /** "Mis partidos": muestra si organizo/juego y si debo reconfirmar. */
  showViewerRole?: boolean;
}

export function MatchCard({ match, today, showViewerRole }: MatchCardProps) {
  const inactive = match.phase === "cancelled" || match.phase === "finished";
  return (
    <Link
      href={openMatchPath(match.id)}
      className={`group flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-surface p-4 transition-colors hover:border-brand-primary/40 ${inactive ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-white">
            {formatOpenMatchDay(match.matchDate, today)}
            <span className="text-brand-muted font-normal"> · </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-brand-muted" />
              {formatOpenMatchTime(match.startTime)}
            </span>
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-brand-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {openMatchPlaceName(match) ? `${openMatchPlaceName(match)}, ${match.city}` : match.city}
            </span>
          </p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-brand-muted group-hover:text-white" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default" size="sm">{openMatchLevelLabel(match.level)}</Badge>
        <MatchPhaseBadge phase={match.phase} />
        <MatchCourtBadge status={match.courtStatus} />
        {showViewerRole && (
          <Badge variant="secondary" size="sm">{match.viewerIsOrganizer ? "Organizas" : "Juegas"}</Badge>
        )}
        {showViewerRole && match.viewerNeedsReconfirm && !inactive && (
          <Badge variant="warning" size="sm">Cambió el horario · confirma</Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3">
        <span className="flex items-center gap-2 text-sm">
          <SpotsDots taken={match.taken} max={match.maxPlayers} />
          <span className={match.spotsLeft > 0 && !inactive ? "font-medium text-white" : "text-brand-muted"}>
            {inactive ? `${match.taken}/${match.maxPlayers} jugadores` : formatSpotsLeft(match.spotsLeft)}
          </span>
        </span>
        <span className="truncate text-xs text-brand-muted">Organiza {match.organizerName}</span>
      </div>
    </Link>
  );
}
