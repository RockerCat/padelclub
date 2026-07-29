import { MatchCard } from "./MatchCard";
import type { BracketRound } from "@/lib/tournamentBracket";

// Each round is a column; columns scroll horizontally as a group (mobile
// and desktop alike) — never all rounds compressed onto one narrow
// screen, never a canvas/complex-SVG rendering. Round-to-round match
// alignment is intentionally left to consistent spacing (justify-around
// per column), never fragile DOM measurement or connector lines.
export function BracketView({ rounds }: { rounds: BracketRound[] }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-stretch gap-6 min-w-max pb-2">
        {rounds.map((round) => (
          <div key={round.roundNumber} className="flex flex-col gap-4 w-64 shrink-0">
            <div className="sticky top-0">
              <h3 className="text-sm font-semibold text-white">{round.label}</h3>
              <p className="text-xs text-brand-muted">
                {round.matches.length} {round.matches.length === 1 ? "partido" : "partidos"}
              </p>
            </div>
            <div className="flex-1 flex flex-col justify-around gap-4">
              {round.matches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
