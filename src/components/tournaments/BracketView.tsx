"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, Toast } from "@/components/ui";
import { MatchCard } from "./MatchCard";
import { ScheduleMatchModal } from "./ScheduleMatchModal";
import { RecordTournamentMatchResultModal } from "./RecordTournamentMatchResultModal";
import { startTournamentMatchAction } from "@/lib/tournamentLifecycleActions";
import type { BracketMatch, BracketRound, TournamentCourtAllocationView } from "@/lib/tournamentBracket";

interface BracketViewProps {
  rounds: BracketRound[];
  isAdmin: boolean;
  tournamentStatus: string;
  clubId: string;
  activeAllocations: TournamentCourtAllocationView[];
  revalidatePaths: string[];
}

// Each round is a column; columns scroll horizontally as a group (mobile
// and desktop alike) — never all rounds compressed onto one narrow
// screen, never a canvas/complex-SVG rendering. Round-to-round match
// alignment is intentionally left to consistent spacing (justify-around
// per column), never fragile DOM measurement or connector lines.
//
// One instance each of ScheduleMatchModal/start-ConfirmDialog/
// RecordTournamentMatchResultModal/Toast shared across every MatchCard
// (same pattern as EntriesSection's single RegisterEntryModal/
// ConfirmDialog) — each piece of state tracks which match is currently
// the target of that specific action.
export function BracketView({
  rounds,
  isAdmin,
  tournamentStatus,
  clubId,
  activeAllocations,
  revalidatePaths,
}: BracketViewProps) {
  const router = useRouter();
  const [schedulingMatch, setSchedulingMatch] = useState<BracketMatch | null>(null);
  const [startingMatch, setStartingMatch] = useState<BracketMatch | null>(null);
  const [scoreModal, setScoreModal] = useState<{ match: BracketMatch; mode: "record" | "correct" } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [startPending, startTransition] = useTransition();

  const roundLabelByNumber = new Map(rounds.map((r) => [r.roundNumber, r.label]));

  function handleScheduleSuccess() {
    const wasReschedule = schedulingMatch?.status === "scheduled";
    setSchedulingMatch(null);
    setToastMessage(wasReschedule ? "Partido reprogramado correctamente" : "Partido programado correctamente");
    router.refresh();
  }

  function handleStartConfirm() {
    if (!startingMatch) return;
    setStartError(null);
    startTransition(async () => {
      const result = await startTournamentMatchAction(clubId, startingMatch.id, revalidatePaths);
      if (result.error) {
        setStartError(result.error);
        return;
      }
      setStartingMatch(null);
      setToastMessage("Partido iniciado correctamente");
      router.refresh();
    });
  }

  function handleScoreSuccess() {
    const wasCorrect = scoreModal?.mode === "correct";
    setScoreModal(null);
    setToastMessage(wasCorrect ? "Resultado corregido correctamente" : "Resultado registrado correctamente");
    router.refresh();
  }

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
                <MatchCard
                  key={match.id}
                  match={match}
                  isAdmin={isAdmin}
                  tournamentStatus={tournamentStatus}
                  onSchedule={setSchedulingMatch}
                  onStart={(m) => {
                    setStartError(null);
                    setStartingMatch(m);
                  }}
                  onRecordResult={(m) => setScoreModal({ match: m, mode: "record" })}
                  onCorrectResult={(m) => setScoreModal({ match: m, mode: "correct" })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {schedulingMatch && (
        <ScheduleMatchModal
          clubId={clubId}
          match={schedulingMatch}
          roundLabel={roundLabelByNumber.get(schedulingMatch.roundNumber) ?? ""}
          activeAllocations={activeAllocations}
          revalidatePaths={revalidatePaths}
          onClose={() => setSchedulingMatch(null)}
          onSuccess={handleScheduleSuccess}
        />
      )}

      <ConfirmDialog
        open={!!startingMatch}
        title="¿Iniciar este partido?"
        message={
          "El partido quedará marcado como en juego y podrás registrar su resultado." +
          (startError ? `\n\n${startError}` : "")
        }
        confirmLabel="Iniciar partido"
        loading={startPending}
        onConfirm={handleStartConfirm}
        onCancel={() => {
          setStartingMatch(null);
          setStartError(null);
        }}
      />

      {scoreModal && (
        <RecordTournamentMatchResultModal
          clubId={clubId}
          match={scoreModal.match}
          roundLabel={roundLabelByNumber.get(scoreModal.match.roundNumber) ?? ""}
          mode={scoreModal.mode}
          revalidatePaths={revalidatePaths}
          onClose={() => setScoreModal(null)}
          onSuccess={handleScoreSuccess}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
