"use client";

import { useState, useTransition } from "react";

interface CancelButtonProps {
  action: () => Promise<void>;
}

export function CancelButton({ action }: CancelButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-10 px-5 rounded-xl border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-colors"
      >
        Cancelar reserva
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
      <p className="text-sm font-semibold text-white mb-0.5">¿Cancelar esta reserva?</p>
      <p className="text-xs text-brand-muted mb-4">
        Esta acción liberará el horario de la cancha.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="h-9 px-4 rounded-xl border border-white/15 text-sm text-brand-muted hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
        >
          Volver
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => action())}
          className="h-9 px-5 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors disabled:opacity-40"
        >
          {pending ? "Cancelando…" : "Confirmar cancelación"}
        </button>
      </div>
    </div>
  );
}
