"use client";

import { useTransition } from "react";

interface CancelButtonProps {
  action: () => Promise<void>;
}

export function CancelButton({ action }: CancelButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => action())}
      className="h-10 px-5 rounded-xl border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Cancelando..." : "Cancelar reserva"}
    </button>
  );
}
