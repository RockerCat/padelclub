import Link from "next/link";
import { Badge } from "@/components/ui";
import { Globe, Lock, Users } from "lucide-react";
import {
  tournamentCategoryLabel,
  tournamentStatusBadgeVariant,
  tournamentStatusLabel,
  tournamentVisibilityLabel,
} from "@/lib/tournamentLabels";
import type { Tournament } from "@/types/database";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function dateRangeLabel(t: Tournament): string {
  if (!t.starts_at && !t.ends_at) return "Sin fecha definida";
  if (t.starts_at && t.ends_at) {
    const start = formatDate(t.starts_at);
    const end = formatDate(t.ends_at);
    return start === end ? start : `${start} – ${end}`;
  }
  return formatDate((t.starts_at ?? t.ends_at)!);
}

// Whole card is a Link to the detail page — list-level actions (edit,
// transitions) live there, never duplicated inline here. `href` lets both
// the OWNER/ADMIN list and the PLAYER list (/[club]/tournaments) reuse
// this exact card instead of two near-identical copies. `confirmedCount`
// is optional — the PLAYER list doesn't fetch it yet, so the card falls
// back to just showing the cupo máximo when it's undefined.
export function TournamentCard({
  tournament,
  href,
  confirmedCount,
}: {
  tournament: Tournament;
  href: string;
  confirmedCount?: number;
}) {
  return (
    <Link
      href={href}
      className="bg-brand-surface border border-white/10 rounded-2xl overflow-hidden flex flex-col hover:border-white/20 transition-colors"
    >
      {tournament.cover_image_url && (
        <div className="w-full aspect-video shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tournament.cover_image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white line-clamp-2 min-w-0">{tournament.name}</h3>
          <Badge variant={tournamentStatusBadgeVariant(tournament.status)} size="sm" className="shrink-0">
            {tournamentStatusLabel(tournament.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Categoría {tournamentCategoryLabel(tournament.category, tournament.secondary_category)} ·{" "}
            {confirmedCount !== undefined
              ? `${confirmedCount}/${tournament.max_pairs} parejas confirmadas`
              : `${tournament.max_pairs} parejas`}
          </span>
          <span className="inline-flex items-center gap-1">
            {tournament.visibility === "public" ? (
              <Globe className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            {tournamentVisibilityLabel(tournament.visibility)}
          </span>
        </div>

        <p className="text-xs text-brand-muted mt-auto pt-2 border-t border-white/[0.06]">
          {dateRangeLabel(tournament)}
        </p>
      </div>
    </Link>
  );
}
