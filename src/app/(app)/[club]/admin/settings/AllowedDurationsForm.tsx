"use client";

import { useActionState, useEffect } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAllowedDurations, type UpdateAllowedDurationsState } from "./actions";
import { DURATION_CATALOG } from "@/lib/durations";

interface AllowedDurationsFormProps {
  clubId: string;
  initialDurations: number[];
}

export function AllowedDurationsForm({ clubId, initialDurations }: AllowedDurationsFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialDurations));
  const boundAction = updateAllowedDurations.bind(null, clubId);
  const [state, action, pending] = useActionState<UpdateAllowedDurationsState, FormData>(
    boundAction,
    {},
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  // Plain, unguarded toggle — every duration behaves identically, including
  // whichever one happens to be the last one checked. The set is allowed to
  // become empty; that's handled below by hasSelection (error + disabled
  // submit), never by disabling the checkbox itself.
  function toggle(minutes: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(minutes)) next.delete(minutes);
      else next.add(minutes);
      return next;
    });
  }

  // The only rule is "at least one selected", derived fresh from `selected`
  // on every render — never from a disabled checkbox. A disabled <input>
  // is excluded from FormData on submit even while still rendered as
  // checked (that mismatch was the actual bug: the last remaining duration
  // looked checked but never reached the server, so `durations` arrived
  // empty and the save was rejected).
  const hasSelection = selected.size > 0;
  const EMPTY_SELECTION_ERROR = "Selecciona al menos una duración.";

  return (
    <div>
      <p className="text-sm text-brand-muted mb-4">
        Duraciones que se mostrarán al crear o solicitar una reserva.
      </p>
      <form action={action} className="flex flex-col gap-4">
          {DURATION_CATALOG.map(({ minutes, label }) => {
            const isChecked = selected.has(minutes);
            return (
              <label key={minutes} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  name="durations"
                  value={String(minutes)}
                  checked={isChecked}
                  onChange={() => toggle(minutes)}
                  className="w-4 h-4 rounded accent-brand-primary cursor-pointer"
                />
                <span className="text-sm text-white group-hover:text-brand-primary transition-colors">
                  {label}
                </span>
              </label>
            );
          })}

          {!hasSelection && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {EMPTY_SELECTION_ERROR}
            </p>
          )}

          {/* A stale state.error from a previous empty-selection submit must
              never linger once the user has re-checked something — only
              show a server error here when it's not that same message
              (which hasSelection above already covers, always freshly). */}
          {state?.error && state.error !== EMPTY_SELECTION_ERROR && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {state.error}
            </p>
          )}

          {state?.success && (
            <p className="text-sm text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-xl px-4 py-3">
              Duraciones actualizadas.
            </p>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={pending || !hasSelection}
              className="h-10 px-5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "var(--club-primary, #00ffff)", color: "#001A24" }}
            >
              {pending ? "Guardando…" : "Guardar duraciones"}
            </button>
          </div>
      </form>
    </div>
  );
}
