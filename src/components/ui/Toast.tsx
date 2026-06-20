"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";

export interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
}

// Self-contained success toast — caller owns the message state and clears it
// in onDismiss. No global provider: each usage renders its own fixed-position
// toast, which is enough since these only ever fire one at a time per page.
export function Toast({ message, onDismiss, durationMs = 3000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[500] flex items-center gap-2 bg-[#082735] border border-emerald-500/25 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
      {message}
    </div>
  );
}
