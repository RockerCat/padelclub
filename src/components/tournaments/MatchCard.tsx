import { HelpCircle, Trophy } from "lucide-react";
import { Badge } from "@/components/ui";
import { PairMemberSlot } from "./PairMemberSlot";
import {
  tournamentCategoryLabel,
  tournamentMatchStatusBadgeVariant,
  tournamentMatchStatusLabel,
} from "@/lib/tournamentLabels";
import type { BracketEntry } from "@/lib/tournamentBracket";

function MatchEntrySlot({
  entry,
  sourceMatchNumber,
  isWinner,
}: {
  entry: BracketEntry | null;
  sourceMatchNumber: number | null;
  isWinner: boolean;
}) {
  if (!entry) {
    // Later-round match whose source hasn't resolved a winner yet — the
    // relation is always expressed as text ("Ganador del partido N"),
    // never inferred visually only, so it reads correctly without color.
    return (
      <div className="flex items-center gap-2 min-w-0 py-1">
        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 shrink-0 flex items-center justify-center">
          <HelpCircle className="w-3.5 h-3.5 text-brand-muted" />
        </div>
        <span className="text-sm text-brand-muted truncate">
          {sourceMatchNumber ? `Ganador del partido ${sourceMatchNumber}` : "Por definir"}
        </span>
      </div>
    );
  }

  const [playerOne, playerTwo] = entry.players;

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <PairMemberSlot member={playerOne} category={entry.category} />
        </div>
        {isWinner && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="Ganador" />}
      </div>
      <PairMemberSlot member={playerTwo} category={entry.category} />
      <span className="text-[10px] text-brand-muted">
        {tournamentCategoryLabel(entry.category, entry.secondaryCategory)}
      </span>
    </div>
  );
}

interface MatchCardProps {
  match: {
    matchNumber: number;
    status: string;
    entryOne: BracketEntry | null;
    entryTwo: BracketEntry | null;
    sourceMatchOneNumber: number | null;
    sourceMatchTwoNumber: number | null;
    winnerEntryId: string | null;
  };
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-3 flex flex-col gap-2 w-64 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-brand-muted">Partido {match.matchNumber}</span>
        <Badge variant={tournamentMatchStatusBadgeVariant(match.status)} size="sm">
          {tournamentMatchStatusLabel(match.status)}
        </Badge>
      </div>

      <MatchEntrySlot
        entry={match.entryOne}
        sourceMatchNumber={match.sourceMatchOneNumber}
        isWinner={!!match.winnerEntryId && match.winnerEntryId === match.entryOne?.id}
      />
      <div className="h-px bg-white/[0.06]" />
      <MatchEntrySlot
        entry={match.entryTwo}
        sourceMatchNumber={match.sourceMatchTwoNumber}
        isWinner={!!match.winnerEntryId && match.winnerEntryId === match.entryTwo?.id}
      />
    </div>
  );
}
