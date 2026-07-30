"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { PairMemberSlot } from "./PairMemberSlot";
import { scheduleTournamentMatchAction } from "@/lib/tournamentSchedulingActions";
import { formatMatchScheduleDate } from "@/lib/tournamentBracket";
import type { BracketMatch, TournamentCourtAllocationView } from "@/lib/tournamentBracket";
import type { TournamentMatchRow } from "@/types/database";

interface ScheduleMatchModalProps {
  clubId: string;
  match: BracketMatch;
  roundLabel: string;
  activeAllocations: TournamentCourtAllocationView[];
  revalidatePaths: string[];
  onClose: () => void;
  onSuccess: (match: TournamentMatchRow | undefined) => void;
}

const fieldClass =
  "w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed";

export function ScheduleMatchModal({
  clubId,
  match,
  roundLabel,
  activeAllocations,
  revalidatePaths,
  onClose,
  onSuccess,
}: ScheduleMatchModalProps) {
  const isReschedule = match.status === "scheduled";
  const [allocationId, setAllocationId] = useState(match.tournamentCourtAllocationId ?? "");
  const [startTime, setStartTime] = useState(match.scheduledStartTime?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(match.scheduledEndTime?.slice(0, 5) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedAllocation = activeAllocations.find((a) => a.id === allocationId) ?? null;

  function handleSubmit() {
    setError(null);
    if (!selectedAllocation) {
      setError("Selecciona una cancha asignada al torneo.");
      return;
    }
    if (!startTime || !endTime) {
      setError("Completa la hora de inicio y de fin.");
      return;
    }
    if (endTime <= startTime) {
      setError("La hora final debe ser posterior a la hora de inicio.");
      return;
    }
    if (startTime < selectedAllocation.startTime.slice(0, 5) || endTime > selectedAllocation.endTime.slice(0, 5)) {
      setError("El horario debe estar dentro de la franja de la cancha seleccionada.");
      return;
    }

    startTransition(async () => {
      const result = await scheduleTournamentMatchAction(
        clubId,
        match.id,
        selectedAllocation.id,
        selectedAllocation.allocationDate,
        startTime,
        endTime,
        revalidatePaths
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess(result.match);
    });
  }

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
            <h2 className="text-base font-semibold text-white">{isReschedule ? "Reprogramar partido" : "Programar partido"}</h2>
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

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80" htmlFor="schedule-allocation">
                Cancha
              </label>
              <select
                id="schedule-allocation"
                value={allocationId}
                onChange={(e) => setAllocationId(e.target.value)}
                className={fieldClass}
              >
                <option value="" disabled className="bg-[#001A24]">
                  Selecciona...
                </option>
                {activeAllocations.map((a) => (
                  <option key={a.id} value={a.id} className="bg-[#001A24]">
                    {a.courtName} — {formatMatchScheduleDate(a.allocationDate)} · {a.startTime.slice(0, 5)}–{a.endTime.slice(0, 5)}
                  </option>
                ))}
              </select>
              {activeAllocations.length === 0 && (
                <p className="text-xs text-brand-muted">
                  No hay canchas activas asignadas a este torneo todavía.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-white/80" htmlFor="schedule-start">
                  Hora de inicio
                </label>
                <input
                  id="schedule-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={!selectedAllocation}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-white/80" htmlFor="schedule-end">
                  Hora de fin
                </label>
                <input
                  id="schedule-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={!selectedAllocation}
                  className={fieldClass}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
            )}
          </div>

          <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10 shrink-0">
            <Button type="button" loading={pending} onClick={handleSubmit}>
              {isReschedule ? "Guardar reprogramación" : "Guardar programación"}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
