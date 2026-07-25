"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { WeekCalendar } from "./WeekCalendar";
import { AdminAvailabilityView } from "./AdminAvailabilityView";

type View = "agenda" | "semana";

// Simple segmented control between "Agenda" (the new default — one day, all
// courts, every block always visible) and "Semana" (the existing week grid,
// WeekCalendar itself untouched). Both are mounted at all times and toggled
// with CSS `hidden` (never conditionally unmounted), so neither view ever
// loses state — its own panel/selection — when the admin switches back and
// forth. The selection lives in plain component state: gone on reload,
// never persisted to Supabase, exactly as asked.
export function ReservationsViewSwitcher({
  weekCalendarProps,
  availabilityProps,
}: {
  weekCalendarProps: ComponentProps<typeof WeekCalendar>;
  availabilityProps: ComponentProps<typeof AdminAvailabilityView>;
}) {
  const [view, setView] = useState<View>("agenda");

  return (
    <div>
      <div className="inline-flex p-1 rounded-xl bg-white/5 border border-white/10 mb-5 gap-1">
        <button
          type="button"
          onClick={() => setView("agenda")}
          aria-pressed={view === "agenda"}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            view === "agenda" ? "bg-brand-primary text-brand-bg" : "text-brand-muted hover:text-white"
          }`}
        >
          Agenda
        </button>
        <button
          type="button"
          onClick={() => setView("semana")}
          aria-pressed={view === "semana"}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            view === "semana" ? "bg-brand-primary text-brand-bg" : "text-brand-muted hover:text-white"
          }`}
        >
          Semana
        </button>
      </div>

      <div className={view === "agenda" ? "" : "hidden"}>
        <AdminAvailabilityView {...availabilityProps} />
      </div>
      <div className={view === "semana" ? "" : "hidden"}>
        <WeekCalendar {...weekCalendarProps} />
      </div>
    </div>
  );
}
