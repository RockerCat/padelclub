import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { cn } from "@/lib/utils/cn";
import {
  formatTournamentAwardDate,
  tournamentAwardPlacementSingularLabel,
} from "@/lib/tournamentAwards";
import type { TournamentAwardPair } from "@/lib/tournamentAwards";

interface TournamentAwardPairCardProps {
  pair: TournamentAwardPair;
  ownClubMemberId?: string | null;
}

// One card per confirmed entry, reused verbatim for OWNER/ADMIN and PLAYER
// (CLAUDE.md → Shared View & Data Patterns) — the only difference between
// audiences is which page mounts TournamentAwardsSection at all, never a
// second version of this card. Values shown (points, names, dates) come
// exclusively from the already-computed TournamentAwardPair view model —
// never previous_total/new_total/cycle_id/adjustment_mode/origin/UUIDs.
export function TournamentAwardPairCard({ pair, ownClubMemberId }: TournamentAwardPairCardProps) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
      {(pair.entryId == null || pair.players.length !== 2) && (
        <p className="text-[11px] text-amber-400">
          Pareja incompleta — revisa el estado de esta posición.
        </p>
      )}

      {pair.players.map((player) => {
        const isOwn = !!ownClubMemberId && player.clubMemberId === ownClubMemberId;
        return (
          <div
            key={player.clubMemberId}
            className={cn("flex items-center gap-3 rounded-xl", isOwn && "bg-white/5 p-2 -m-2")}
          >
            <PlayerAvatar
              player={{ id: player.clubMemberId, full_name: player.name, avatar_url: player.avatarUrl }}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{player.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-brand-muted">
                <span>Participación +{player.participationPoints}</span>
                {player.placementPoints > 0 && (
                  <span>
                    {tournamentAwardPlacementSingularLabel(player.placement)} +{player.placementPoints}
                  </span>
                )}
                <span className="text-white font-semibold">Total +{player.totalPoints}</span>
              </div>
            </div>
          </div>
        );
      })}

      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
        <span className="text-brand-muted">Pareja</span>
        <span className="text-white font-semibold">+{pair.pairTotalPoints} puntos</span>
      </div>

      {pair.players[0]?.awardedAt && (
        <p className="text-[11px] text-brand-muted">
          Asignado el {formatTournamentAwardDate(pair.players[0].awardedAt)}
        </p>
      )}
    </div>
  );
}
