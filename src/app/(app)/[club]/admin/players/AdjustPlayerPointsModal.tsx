"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { adjustPlayerPoints, type AdjustPointsState } from "./actions";
import { POINT_ADJUSTMENT_REASONS, SPORT_NOTE_MAX_LENGTH } from "@/lib/sportOperations";

interface AdjustPlayerPointsModalProps {
  clubId: string;
  clubSlug: string;
  clubMemberId: string;
  playerName: string;
  category: string | null;
  currentPoints: number;
  onClose: () => void;
  onSuccess: (newTotal: number) => void;
}

// Fase 1 módulo deportivo — ajuste manual de puntos (modalidad delta
// únicamente; "establecer total directo" no es parte de este bloque). Toda
// regla real vive en adjust_club_player_points (SECURITY DEFINER); este
// componente solo recopila la entrada y muestra el resumen antes de
// enviar, igual que el resto de los formularios de esta pantalla.
export function AdjustPlayerPointsModal({
  clubId,
  clubSlug,
  clubMemberId,
  playerName,
  category,
  currentPoints,
  onClose,
  onSuccess,
}: AdjustPlayerPointsModalProps) {
  const boundAction = adjustPlayerPoints.bind(null, clubId, clubMemberId, clubSlug);
  const [state, action, pending] = useActionState<AdjustPointsState, FormData>(boundAction, {});
  const [deltaInput, setDeltaInput] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");

  const delta = parseInt(deltaInput, 10);
  const hasValidDelta = Number.isFinite(delta) && delta !== 0;
  const resultingTotal = hasValidDelta ? Math.max(currentPoints + delta, 0) : currentPoints;
  const canSubmit = hasValidDelta && reasonCode.length > 0 && note.trim().length > 0;

  useEffect(() => {
    if (state.success && typeof state.newTotal === "number") {
      onSuccess(state.newTotal);
    }
  }, [state.success, state.newTotal, onSuccess]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[500]"
      style={{ backdropFilter: "blur(4px)" }}
      onClick={onClose}
      aria-hidden
    >
      <div
        className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-auto w-full md:w-[440px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col isolate"
          style={{ maxHeight: "90dvh" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">Ajustar puntos</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5">
            <form action={action} className="flex flex-col gap-4">
              <p className="text-sm text-white/80 truncate">{playerName}</p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="delta_points" className="text-xs font-medium text-brand-muted">
                  Puntos a sumar o restar
                </label>
                <input
                  id="delta_points"
                  name="delta_points"
                  type="number"
                  step="1"
                  value={deltaInput}
                  onChange={(e) => setDeltaInput(e.target.value)}
                  placeholder="Ej: 10 o -5"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reason_code" className="text-xs font-medium text-brand-muted">
                  Motivo
                </label>
                <select
                  id="reason_code"
                  name="reason_code"
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
                >
                  <option value="" disabled className="bg-[#001A24]">
                    Selecciona un motivo
                  </option>
                  {POINT_ADJUSTMENT_REASONS.map((r) => (
                    <option key={r.code} value={r.code} className="bg-[#001A24]">
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="note" className="text-xs font-medium text-brand-muted">
                  Nota
                </label>
                <textarea
                  id="note"
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={SPORT_NOTE_MAX_LENGTH}
                  rows={3}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
                />
              </div>

              {/* Resumen previo — se actualiza en vivo mientras se escribe */}
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-brand-muted">Puntos actuales</span>
                  <span className="text-white">{currentPoints}{category ? ` · ${category}` : ""}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-brand-muted">Ajuste</span>
                  <span className="text-white">{hasValidDelta ? (delta > 0 ? `+${delta}` : delta) : "—"}</span>
                </div>
                <div className="flex items-center justify-between font-medium">
                  <span className="text-brand-muted">Resultado</span>
                  <span className="text-white">{resultingTotal}</span>
                </div>
              </div>

              {state.error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {state.error}
                </p>
              )}

              {state.success && (
                <p className="text-sm text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-xl px-4 py-3">
                  Puntos actualizados correctamente.
                </p>
              )}

              <div className="pt-1 flex justify-end">
                <Button type="submit" disabled={!canSubmit} loading={pending}>
                  {pending ? "Guardando…" : "Confirmar ajuste"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
