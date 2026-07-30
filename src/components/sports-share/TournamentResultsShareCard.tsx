import { Trophy } from "lucide-react";
import { PairMemberSlot, type PairMemberSlotPlayer } from "@/components/tournaments/PairMemberSlot";
import { cn } from "@/lib/utils/cn";
import { ShareCardShell } from "./ShareCardShell";

export interface ResultsShareEntry {
  id: string;
  category: string;
  players: PairMemberSlotPlayer[];
}

export interface ResultsShareMatch {
  id: string;
  roundLabel: string;
  entryOne: ResultsShareEntry | null;
  entryTwo: ResultsShareEntry | null;
  winnerEntryId: string | null;
  // Ya formateado por el caller a partir de los 6 campos reales de
  // tournament_matches (set_one_entry_one, ...) — nunca recalculado aquí,
  // solo mostrado tal cual vino del backend.
  scoreLine: string | null;
}

interface TournamentResultsShareCardProps {
  clubName: string;
  clubLogoDataUrl: string | null;
  accentColor: string;
  tournamentName: string;
  categoryLabel: string;
  dateLabel: string;
  generatedAtLabel: string;
  // Como máximo Final + Semifinales (las últimas 2 rondas del bracket,
  // sin importar el tamaño del cuadro: 4, 8 o 16 parejas) — nunca el
  // cuadro completo, que dejaría de ser legible en una sola imagen.
  matches: ResultsShareMatch[];
}

function EntrySide({ entry, isWinner }: { entry: ResultsShareEntry | null; isWinner: boolean }) {
  if (!entry) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <span className="text-sm text-white/40">Por definir</span>
      </div>
    );
  }
  return (
    <div className={cn("flex-1 min-w-0 flex flex-col gap-1.5", isWinner && "opacity-100", !isWinner && "opacity-60")}>
      {entry.players.map((player) => (
        <PairMemberSlot key={player.club_member_id} member={player} category={entry.category} />
      ))}
    </div>
  );
}

function MatchRow({ match }: { match: ResultsShareMatch }) {
  const oneWins = !!match.winnerEntryId && match.winnerEntryId === match.entryOne?.id;
  const twoWins = !!match.winnerEntryId && match.winnerEntryId === match.entryTwo?.id;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white/50 uppercase tracking-wide">{match.roundLabel}</span>
        {match.scoreLine && (
          <span className="text-base font-bold text-white tabular-nums">{match.scoreLine}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <EntrySide entry={match.entryOne} isWinner={oneWins} />
        <span className="text-sm text-white/30 shrink-0">vs</span>
        <EntrySide entry={match.entryTwo} isWinner={twoWins} />
      </div>
      {(oneWins || twoWins) && (
        <div className="flex items-center gap-1.5 text-amber-400">
          <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-xs font-semibold">Ganador confirmado por el club</span>
        </div>
      )}
    </div>
  );
}

// Bloque 3.4 — segunda imagen exportable del torneo: recorrido competitivo
// final. Decisión de auditoría (opción C: "resultados finales destacados"):
// un bracket completo de 8/16 parejas es ilegible en una sola imagen
// vertical, así que esta tarjeta muestra siempre, sin importar el tamaño
// del cuadro, únicamente las últimas 2 rondas (semifinales + final) — nunca
// recalcula marcador ni ganador, solo los muestra tal como ya los entregó
// el backend (tournament_matches.winner_entry_id / set_*).
export function TournamentResultsShareCard({
  clubName,
  clubLogoDataUrl,
  accentColor,
  tournamentName,
  categoryLabel,
  dateLabel,
  generatedAtLabel,
  matches,
}: TournamentResultsShareCardProps) {
  return (
    <ShareCardShell
      clubName={clubName}
      clubLogoDataUrl={clubLogoDataUrl}
      accentColor={accentColor}
      eyebrow={`Torneo · ${categoryLabel}`}
      title={tournamentName}
      subtitle={dateLabel}
      generatedAtLabel={generatedAtLabel}
    >
      <div className="flex flex-col justify-center gap-4 h-full">
        {matches.map((match) => (
          <MatchRow key={match.id} match={match} />
        ))}
      </div>
    </ShareCardShell>
  );
}
