import { CalendarClock, HelpCircle, MapPin, Trophy } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { PairMemberSlot } from "./PairMemberSlot";
import {
  tournamentCategoryLabel,
  tournamentMatchStatusBadgeVariant,
  tournamentMatchStatusLabel,
} from "@/lib/tournamentLabels";
import {
  canCorrectTournamentMatchResult,
  canRecordTournamentMatchResult,
  canStartTournamentMatch,
  formatMatchScheduleDate,
  formatMatchScheduleTimeRange,
  isMatchSchedulable,
} from "@/lib/tournamentBracket";
import type { BracketEntry, BracketMatch } from "@/lib/tournamentBracket";

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
        {isWinner && (
          <span className="inline-flex items-center gap-1 shrink-0">
            <Trophy className="w-3.5 h-3.5 text-amber-400" aria-hidden />
            <span className="text-[10px] font-semibold text-amber-400">Ganador</span>
          </span>
        )}
      </div>
      <PairMemberSlot member={playerTwo} category={entry.category} />
      <span className="text-[10px] text-brand-muted">
        {tournamentCategoryLabel(entry.category, entry.secondaryCategory)}
      </span>
    </div>
  );
}

function MatchScore({ match }: { match: BracketMatch }) {
  const sets: [number | null, number | null][] = [
    [match.setOneEntryOne, match.setOneEntryTwo],
    [match.setTwoEntryOne, match.setTwoEntryTwo],
  ];
  if (match.setThreeEntryOne != null) sets.push([match.setThreeEntryOne, match.setThreeEntryTwo]);

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 text-xs pt-2 border-t border-white/[0.06]">
      <span className={match.winnerEntryId === match.entryOne?.id ? "text-white font-semibold" : "text-brand-muted"}>
        Pareja 1
      </span>
      <span className="flex gap-2 tabular-nums">
        {sets.map(([one], i) => (
          <span key={i} className={match.winnerEntryId === match.entryOne?.id ? "text-white font-semibold" : "text-brand-muted"}>
            {one}
          </span>
        ))}
      </span>
      <span className={match.winnerEntryId === match.entryTwo?.id ? "text-white font-semibold" : "text-brand-muted"}>
        Pareja 2
      </span>
      <span className="flex gap-2 tabular-nums">
        {sets.map(([, two], i) => (
          <span key={i} className={match.winnerEntryId === match.entryTwo?.id ? "text-white font-semibold" : "text-brand-muted"}>
            {two}
          </span>
        ))}
      </span>
    </div>
  );
}

interface MatchCardProps {
  match: BracketMatch;
  isAdmin: boolean;
  tournamentStatus: string;
  onSchedule?: (match: BracketMatch) => void;
  onStart?: (match: BracketMatch) => void;
  onRecordResult?: (match: BracketMatch) => void;
  onCorrectResult?: (match: BracketMatch) => void;
}

export function MatchCard({
  match,
  isAdmin,
  tournamentStatus,
  onSchedule,
  onStart,
  onRecordResult,
  onCorrectResult,
}: MatchCardProps) {
  const schedulable = isMatchSchedulable(match, tournamentStatus);
  const startable = canStartTournamentMatch(match, tournamentStatus);
  const recordable = canRecordTournamentMatchResult(match, tournamentStatus);
  const correctable = canCorrectTournamentMatchResult(match, tournamentStatus);
  const isScheduled = !!match.scheduledDate && !!match.scheduledStartTime;
  const isCompleted = match.status === "completed";
  const participantsUnresolved = !match.entryOne || !match.entryTwo;

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

      {isCompleted && <MatchScore match={match} />}

      {isScheduled && !isCompleted && (
        <div className="flex flex-col gap-0.5 pt-2 border-t border-white/[0.06] text-xs text-brand-muted">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3 h-3 shrink-0" />
            {match.courtName ?? "Cancha"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="w-3 h-3 shrink-0" />
            {formatMatchScheduleDate(match.scheduledDate!)} · {formatMatchScheduleTimeRange(match.scheduledStartTime!, match.scheduledEndTime)}
          </span>
        </div>
      )}

      {!isScheduled && !isCompleted && !isAdmin && (
        <p className="text-xs text-brand-muted pt-2 border-t border-white/[0.06]">Horario por definir</p>
      )}

      {isAdmin && (
        <div className="pt-1 flex flex-col gap-1.5">
          {schedulable && (
            <Button size="sm" variant="secondary" onClick={() => onSchedule?.(match)} className="w-full">
              {isScheduled ? "Reprogramar" : "Programar partido"}
            </Button>
          )}
          {startable && (
            <Button size="sm" onClick={() => onStart?.(match)} className="w-full">
              Iniciar partido
            </Button>
          )}
          {recordable && (
            <Button size="sm" onClick={() => onRecordResult?.(match)} className="w-full">
              Registrar resultado
            </Button>
          )}
          {correctable && (
            <Button size="sm" variant="secondary" onClick={() => onCorrectResult?.(match)} className="w-full">
              Corregir resultado
            </Button>
          )}
          {!schedulable && !startable && !recordable && !correctable && participantsUnresolved && (
            <p className="text-[11px] text-brand-muted">
              Se podrá programar cuando se definan sus participantes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
