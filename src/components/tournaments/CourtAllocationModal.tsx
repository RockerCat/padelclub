"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import {
  createTournamentCourtAllocationAction,
  updateTournamentCourtAllocationAction,
} from "@/lib/tournamentSchedulingActions";
import type { TournamentCourtAllocationView } from "@/lib/tournamentBracket";
import type { TournamentCourtAllocationRow } from "@/types/database";

interface CourtAllocationModalProps {
  clubId: string;
  tournamentId: string;
  courts: { id: string; name: string }[];
  allocation?: TournamentCourtAllocationView;
  revalidatePaths: string[];
  onClose: () => void;
  onSuccess: (allocation: TournamentCourtAllocationRow | undefined) => void;
}

const fieldClass =
  "w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed";

// Create and edit share this one modal (same pattern as TournamentForm) —
// only the bound action and whether `allocation` is passed differ.
// allocation_date/start_time/end_time are plain date/time columns (no
// timezone conversion at all, unlike tournaments.starts_at — see Bloque
// 2.4 audit): whatever the user types is exactly what's sent and stored,
// same convention already used by reservations.
export function CourtAllocationModal({
  clubId,
  tournamentId,
  courts,
  allocation,
  revalidatePaths,
  onClose,
  onSuccess,
}: CourtAllocationModalProps) {
  const isEdit = !!allocation;
  const [courtId, setCourtId] = useState(allocation?.courtId ?? "");
  const [date, setDate] = useState(allocation?.allocationDate ?? "");
  const [startTime, setStartTime] = useState(allocation?.startTime.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(allocation?.endTime.slice(0, 5) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    if (!courtId || !date || !startTime || !endTime) {
      setError("Completa la cancha, la fecha y el horario.");
      return;
    }
    if (endTime <= startTime) {
      setError("La hora final debe ser posterior a la hora de inicio.");
      return;
    }
    startTransition(async () => {
      const result = isEdit
        ? await updateTournamentCourtAllocationAction(
            clubId,
            allocation!.id,
            courtId,
            date,
            startTime,
            endTime,
            revalidatePaths
          )
        : await createTournamentCourtAllocationAction(
            clubId,
            tournamentId,
            courtId,
            date,
            startTime,
            endTime,
            revalidatePaths
          );

      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess(result.allocation);
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
          className="pointer-events-auto w-full md:w-[480px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">{isEdit ? "Editar cancha del torneo" : "Agregar cancha al torneo"}</h2>
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
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80" htmlFor="allocation-court">
                Cancha
              </label>
              <select
                id="allocation-court"
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                className={fieldClass}
              >
                <option value="" disabled className="bg-[#001A24]">
                  Selecciona...
                </option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#001A24]">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80" htmlFor="allocation-date">
                Fecha
              </label>
              <input
                id="allocation-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-white/80" htmlFor="allocation-start">
                  Hora de inicio
                </label>
                <input
                  id="allocation-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-white/80" htmlFor="allocation-end">
                  Hora de fin
                </label>
                <input
                  id="allocation-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
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
              {isEdit ? "Guardar cambios" : "Agregar cancha"}
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
