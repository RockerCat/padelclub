"use client";

import { useEffect } from "react";
import { Button, type ButtonProps } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Same visual language as ReservationModal: blurred backdrop, centered panel
// on desktop / bottom sheet on mobile, bg-[#082735] surface.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar acción",
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onCancel}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[420px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-5">
            <h2 className="text-base font-semibold text-white mb-2">{title}</h2>
            <p className="text-sm text-brand-muted whitespace-pre-line">{message}</p>
          </div>
          <div className="flex items-center gap-3 px-5 pb-5">
            <Button type="button" variant="secondary" disabled={loading} onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button type="button" variant={confirmVariant} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
