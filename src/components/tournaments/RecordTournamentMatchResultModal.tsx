"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button, ConfirmDialog } from "@/components/ui";
import { PairMemberSlot } from "./PairMemberSlot";
import {
  recordTournamentMatchResultAction,
  correctTournamentMatchResultAction,
} from "@/lib/tournamentLifecycleActions";
import { validateTournamentMatchScore } from "@/lib/tournamentBracket";
import type { BracketMatch } from "@/lib/tournamentBracket";
import type { TournamentMatchRow } from "@/types/database";

interface RecordTournamentMatchResultModalProps {
  clubId: string;
  match: BracketMatch;
  roundLabel: string;
  mode: "record" | "correct";
  revalidatePaths: string[];
  onClose: () => void;
  onSuccess: (match: TournamentMatchRow | undefined) => void;
}

const scoreFieldClass =
  "w-14 h-10 rounded-xl border border-white/10 bg-white/5 px-2 text-center text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50";

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Record (fresh, in_progress → completed) and correct (completed →
// completed with a new score) share this one modal, prefilled with the
// current score when correcting — same pattern as CourtAllocationModal/
// TournamentForm. The winner is always computed here purely for display
// (validateTournamentMatchScore, the exact pure mirror of the backend's
// own validation) — it is never sent to the RPC, which derives it itself
// from the raw set scores (audited, 20260913000001).
export function RecordTournamentMatchResultModal({
  clubId,
  match,
  roundLabel,
  mode,
  revalidatePaths,
  onClose,
  onSuccess,
}: RecordTournamentMatchResultModalProps) {
  const isCorrect = mode === "correct";
  const [setOneEntryOne, setSetOneEntryOne] = useState(match.setOneEntryOne?.toString() ?? "");
  const [setOneEntryTwo, setSetOneEntryTwo] = useState(match.setOneEntryTwo?.toString() ?? "");
  const [setTwoEntryOne, setSetTwoEntryOne] = useState(match.setTwoEntryOne?.toString() ?? "");
  const [setTwoEntryTwo, setSetTwoEntryTwo] = useState(match.setTwoEntryTwo?.toString() ?? "");
  const [setThreeEntryOne, setSetThreeEntryOne] = useState(match.setThreeEntryOne?.toString() ?? "");
  const [setThreeEntryTwo, setSetThreeEntryTwo] = useState(match.setThreeEntryTwo?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmCorrectOpen, setConfirmCorrectOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const score = {
    setOneEntryOne: toNumberOrNull(setOneEntryOne),
    setOneEntryTwo: toNumberOrNull(setOneEntryTwo),
    setTwoEntryOne: toNumberOrNull(setTwoEntryOne),
    setTwoEntryTwo: toNumberOrNull(setTwoEntryTwo),
    setThreeEntryOne: toNumberOrNull(setThreeEntryOne),
    setThreeEntryTwo: toNumberOrNull(setThreeEntryTwo),
  };
  const validation = validateTournamentMatchScore(score);

  function submit() {
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    setError(null);
    const params = {
      setOneEntryOne: score.setOneEntryOne!,
      setOneEntryTwo: score.setOneEntryTwo!,
      setTwoEntryOne: score.setTwoEntryOne!,
      setTwoEntryTwo: score.setTwoEntryTwo!,
      setThreeEntryOne: score.setThreeEntryOne,
      setThreeEntryTwo: score.setThreeEntryTwo,
    };
    startTransition(async () => {
      const result = isCorrect
        ? await correctTournamentMatchResultAction(clubId, match.id, params, revalidatePaths)
        : await recordTournamentMatchResultAction(clubId, match.id, params, revalidatePaths);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmCorrectOpen(false);
      onSuccess(result.match);
    });
  }

  function handleSubmitClick() {
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    setError(null);
    if (isCorrect) {
      setConfirmCorrectOpen(true);
      return;
    }
    submit();
  }

  const winnerLabel = validation.valid ? (validation.winner === "one" ? "Pareja 1" : "Pareja 2") : null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[520px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">
              {isCorrect ? "Corregir resultado" : "Registrar resultado"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs text-brand-muted">
                {roundLabel} · Partido {match.matchNumber}
              </p>
              {match.entryOne && (
                <div className="flex flex-col gap-1">
                  <PairMemberSlot member={match.entryOne.players[0]} category={match.entryOne.category} />
                  <PairMemberSlot member={match.entryOne.players[1]} category={match.entryOne.category} />
                </div>
              )}
              <p className="text-[10px] text-brand-muted text-center">vs</p>
              {match.entryTwo && (
                <div className="flex flex-col gap-1">
                  <PairMemberSlot member={match.entryTwo.players[0]} category={match.entryTwo.category} />
                  <PairMemberSlot member={match.entryTwo.players[1]} category={match.entryTwo.category} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2">
              <span className="text-xs text-brand-muted">&nbsp;</span>
              <span className="text-xs font-medium text-white/80 text-center w-14">Pareja 1</span>
              <span className="text-xs font-medium text-white/80 text-center w-14">Pareja 2</span>

              <label htmlFor="set-one-one" className="text-sm text-white/80">
                Set 1
              </label>
              <input
                id="set-one-one"
                type="number"
                min={0}
                inputMode="numeric"
                value={setOneEntryOne}
                onChange={(e) => setSetOneEntryOne(e.target.value)}
                className={scoreFieldClass}
                aria-label="Set 1, juegos de la pareja 1"
              />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={setOneEntryTwo}
                onChange={(e) => setSetOneEntryTwo(e.target.value)}
                className={scoreFieldClass}
                aria-label="Set 1, juegos de la pareja 2"
              />

              <label htmlFor="set-two-one" className="text-sm text-white/80">
                Set 2
              </label>
              <input
                id="set-two-one"
                type="number"
                min={0}
                inputMode="numeric"
                value={setTwoEntryOne}
                onChange={(e) => setSetTwoEntryOne(e.target.value)}
                className={scoreFieldClass}
                aria-label="Set 2, juegos de la pareja 1"
              />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={setTwoEntryTwo}
                onChange={(e) => setSetTwoEntryTwo(e.target.value)}
                className={scoreFieldClass}
                aria-label="Set 2, juegos de la pareja 2"
              />

              <label htmlFor="set-three-one" className="text-sm text-white/80">
                Set 3 <span className="text-brand-muted">(opcional)</span>
              </label>
              <input
                id="set-three-one"
                type="number"
                min={0}
                inputMode="numeric"
                value={setThreeEntryOne}
                onChange={(e) => setSetThreeEntryOne(e.target.value)}
                className={scoreFieldClass}
                aria-label="Set 3, juegos de la pareja 1"
              />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={setThreeEntryTwo}
                onChange={(e) => setSetThreeEntryTwo(e.target.value)}
                className={scoreFieldClass}
                aria-label="Set 3, juegos de la pareja 2"
              />
            </div>

            {winnerLabel && (
              <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                Ganador: <span className="font-semibold">{winnerLabel}</span>
              </p>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
            )}
          </div>

          <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10 shrink-0">
            <Button type="button" loading={pending && !isCorrect} onClick={handleSubmitClick}>
              {isCorrect ? "Corregir resultado" : "Guardar resultado"}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>

      {isCorrect && (
        <ConfirmDialog
          open={confirmCorrectOpen}
          title="¿Corregir este resultado?"
          message={
            "Corregir este resultado puede cambiar la pareja clasificada a la siguiente ronda." +
            (error ? `\n\n${error}` : "")
          }
          confirmLabel="Corregir resultado"
          confirmVariant="danger"
          loading={pending}
          onConfirm={submit}
          onCancel={() => {
            setConfirmCorrectOpen(false);
            setError(null);
          }}
        />
      )}
    </>
  );
}
