"use client";

import { useActionState } from "react";
import { useState } from "react";
import { updateAllowedDurations, type UpdateAllowedDurationsState } from "./actions";
import { DURATION_CATALOG } from "@/lib/durations";
import { Card, CardHeader, CardContent } from "@/components/ui";

interface AllowedDurationsFormProps {
  clubId: string;
  initialDurations: number[];
}

export function AllowedDurationsForm({ clubId, initialDurations }: AllowedDurationsFormProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialDurations));
  const boundAction = updateAllowedDurations.bind(null, clubId);
  const [state, action, pending] = useActionState<UpdateAllowedDurationsState, FormData>(
    boundAction,
    {},
  );

  function toggle(minutes: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(minutes)) {
        if (next.size === 1) return prev; // must keep at least one
        next.delete(minutes);
      } else {
        next.add(minutes);
      }
      return next;
    });
  }

  return (
    <Card variant="default">
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-white">Duraciones permitidas</h2>
          <p className="text-sm text-brand-muted mt-0.5">
            Duraciones que se mostrarán al crear o solicitar una reserva.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          {DURATION_CATALOG.map(({ minutes, label }) => {
            const isChecked = selected.has(minutes);
            const isLast = selected.size === 1 && isChecked;
            return (
              <label
                key={minutes}
                className={`flex items-center gap-3 cursor-pointer group ${isLast ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  name="durations"
                  value={String(minutes)}
                  checked={isChecked}
                  disabled={isLast}
                  onChange={() => toggle(minutes)}
                  className="w-4 h-4 rounded accent-brand-primary cursor-pointer"
                />
                <span className="text-sm text-white group-hover:text-brand-primary transition-colors">
                  {label}
                </span>
              </label>
            );
          })}

          {state?.error && (
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
              disabled={pending}
              className="h-10 px-5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "#001A24" }}
            >
              {pending ? "Guardando…" : "Guardar duraciones"}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
