"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, Input } from "@/components/ui";

// Same visual language as RejectReservationModal (blurred backdrop,
// centered panel on desktop / bottom sheet on mobile, bg-[#082735]
// surface) — mounted on demand by the caller, never kept mounted while
// closed, so every open gets a clean form with no separate reset effect.
// Purely a form: it never calls the server itself — the caller
// (ReservationTicketPanel) owns the useTransition/pending state and the
// actual addReservationExtraTime call, same division of responsibility
// RejectReservationModal already uses with its own caller.

const NOTE_MAX_LENGTH = 500;

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

interface AddExtraTimeModalProps {
  pending: boolean;
  error: string | null;
  startTime: string; // "HH:MM"
  currentDurationMinutes: number; // already includes any prior extra time
  currentEndTime: string; // "HH:MM" — precomputed by the caller
  priceAmount: number | null;
  existingExtraAmount: number;
  currency: string; // best-known currency for this reservation (price_currency ?? extra_currency ?? "COP")
  onConfirm: (extraMinutes: number, extraAmount: number, note: string) => void;
  onCancel: () => void;
}

export function AddExtraTimeModal({
  pending,
  error,
  startTime,
  currentDurationMinutes,
  currentEndTime,
  priceAmount,
  existingExtraAmount,
  currency,
  onConfirm,
  onCancel,
}: AddExtraTimeModalProps) {
  const [minutesInput, setMinutesInput] = useState("");
  const [amountInput, setAmountInput] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const extraMinutes = parseInt(minutesInput, 10);
  const extraAmount = amountInput.trim() === "" ? 0 : Number(amountInput);
  const minutesValid = Number.isInteger(extraMinutes) && extraMinutes > 0;
  const amountValid = Number.isFinite(extraAmount) && extraAmount >= 0;
  const canSubmit = !pending && minutesValid && amountValid;

  const newEndTime = minutesValid ? addMinutes(startTime, currentDurationMinutes + extraMinutes) : null;
  const newTotal =
    priceAmount != null || existingExtraAmount > 0 || (amountValid && extraAmount > 0)
      ? (priceAmount ?? 0) + existingExtraAmount + (amountValid ? extraAmount : 0)
      : null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || pending) return; // guards against double-submit
    onConfirm(extraMinutes, extraAmount, note);
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[500]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={pending ? undefined : onCancel}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[501] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[440px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-base font-semibold text-white">Agregar tiempo extra</h2>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="p-1.5 rounded-lg text-brand-muted hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
            <Input
              label="Minutos adicionales"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="Ej. 25"
              value={minutesInput}
              onChange={(e) => setMinutesInput(e.target.value)}
              disabled={pending}
              required
              autoFocus
            />

            <Input
              label={`Valor adicional (${currency})`}
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={pending}
              hint="Deja 0 si el club no va a cobrar la extensión."
            />

            <div>
              <label
                htmlFor="extra-time-note"
                className="text-sm font-medium text-white/80 mb-1.5 block"
              >
                Nota opcional
              </label>
              <textarea
                id="extra-time-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
                rows={2}
                maxLength={NOTE_MAX_LENGTH}
                placeholder="Ej. Extensión solicitada en recepción"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-primary/50 resize-none disabled:opacity-50"
              />
            </div>

            {/* Preview — shown once the minutes field is a valid positive
                integer; nothing is submitted until the admin confirms. */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Horario actual</span>
                <span className="text-white tabular-nums">{startTime} – {currentEndTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Nueva hora de finalización</span>
                <span className="text-white font-semibold tabular-nums">{newEndTime ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Valor adicional</span>
                <span className="text-white tabular-nums">
                  {amountValid ? formatCurrency(extraAmount, currency) : "—"}
                </span>
              </div>
              {newTotal != null && (
                <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-white/[0.06]">
                  <span className="text-brand-muted">Nuevo total de la reserva</span>
                  <span className="text-white font-semibold tabular-nums">{formatCurrency(newTotal, currency)}</span>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button type="button" variant="secondary" disabled={pending} onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!canSubmit} className="flex-1">
                Agregar tiempo
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
