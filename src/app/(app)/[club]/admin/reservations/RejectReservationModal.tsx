"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import {
  REJECTION_REASONS,
  REJECTION_COMMENT_MAX_LENGTH,
  type RejectionReasonCode,
} from "@/lib/reservationRejection";

// Same visual language as ConfirmDialog/RequestModal: blurred backdrop,
// centered panel on desktop / bottom sheet on mobile, bg-[#082735] surface.
// Only ever rendered by the caller while open (`{rejectModalOpen && <...>}`,
// same mount-on-demand pattern as RequestModal) — mounting fresh each time
// is what gives every rejection attempt a clean reason/comment, with no
// separate reset effect needed. Used both by PendingRequestsSection's
// compact card and PendingReservationReview's full page, one modal, not two.
export function RejectReservationModal({
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  pending: boolean;
  error: string | null;
  onConfirm: (reasonCode: RejectionReasonCode, comment: string) => void;
  onCancel: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode>(REJECTION_REASONS[0].code);
  const [comment, setComment] = useState("");

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

  const isOther = reasonCode === "other";
  const trimmedComment = comment.trim();
  const canSubmit = !pending && (!isOther || trimmedComment.length > 0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || pending) return; // guards against double-submit
    onConfirm(reasonCode, comment);
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={pending ? undefined : onCancel}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[440px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-base font-semibold text-white">Rechazar solicitud</h2>
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
            <div>
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">
                Motivo
              </p>
              <div className="flex flex-col gap-2">
                {REJECTION_REASONS.map((r) => (
                  <label
                    key={r.code}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${
                      reasonCode === r.code
                        ? "border-brand-primary bg-brand-primary/10 text-white"
                        : "border-white/10 text-brand-muted hover:border-white/30 hover:text-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reject_reason_code"
                      value={r.code}
                      checked={reasonCode === r.code}
                      onChange={() => setReasonCode(r.code)}
                      disabled={pending}
                      className="accent-brand-primary"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="reject-comment"
                className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 block"
              >
                {isOther ? "Explica el motivo (obligatorio)" : "Comentario adicional (opcional)"}
              </label>
              <textarea
                id="reject-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={pending}
                rows={3}
                maxLength={REJECTION_COMMENT_MAX_LENGTH}
                placeholder={
                  isOther ? "Escribe el motivo del rechazo…" : "Agrega detalles para el jugador…"
                }
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-primary/50 resize-none disabled:opacity-50"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={onCancel}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={pending}
                disabled={!canSubmit}
                className="flex-1"
              >
                Rechazar reserva
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
