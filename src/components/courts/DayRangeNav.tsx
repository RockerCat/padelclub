"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { timeToMins } from "@/lib/courtAvailability";

// Shared day-range navigation — built for the player's Reservations page,
// now also reused by the OWNER/ADMIN Agenda view, so both stay on the
// exact same responsive breakpoints, day-tab visuals and day-indicator
// logic instead of two separate implementations drifting apart.

export type DayRangeDay = {
  date: string;
  dayName: string;
  dayNum: number;
  monthName: string;
  isPast: boolean;
};

// One day-navigation variant (7/10/14-day block) — the page computes all
// three from the same anchor date so each breakpoint's arrows can step by
// exactly its own block size. `count` slices the shared superset of days;
// `className` is the sole thing deciding which variant is actually visible
// at a given viewport (pure CSS, no width detection); `variant` picks the
// day-tabs layout: "scroll" reproduces the original mobile horizontal
// strip unchanged, "grid" distributes cards across the full available
// width for wider blocks.
export type DayRangeBlock = {
  count: number;
  variant: "scroll" | "grid";
  className: string;
  label: string;
  prevHref: string;
  nextHref: string;
};

// Day-card summary indicator — coarse, club-wide (not per-court) buckets
// built from the same per-day/per-court `availability` already sent by the
// server. "closed" = no operating hours that day.
type DaySegmentState = "available" | "occupied" | "closed";

const DAY_INDICATOR_SEGMENTS = 5;

// Coarse day-level summary for the day cards — buckets the operating window
// into a handful of equal ranges and marks each "available" if ANY court has
// a free slot inside it. Deliberately imprecise per-court (spec: this is a
// day-level summary, not a per-court readout) — built only from the real
// `availability` already computed server-side, no new rule and no extra
// query: every caller already has this data for whatever days it renders.
function buildDayIndicator(
  date: string,
  courts: Array<{ id: string }>,
  availability: Record<string, Record<string, string[]>>,
  closedDates: string[],
  openingMinsByDate: Record<string, number>,
  closingMinsByDate: Record<string, number>,
): DaySegmentState[] {
  const openMins = openingMinsByDate[date];
  const closeMins = closingMinsByDate[date];
  if (closedDates.includes(date) || openMins === undefined || closeMins === undefined || closeMins <= openMins) {
    return Array<DaySegmentState>(DAY_INDICATOR_SEGMENTS).fill("closed");
  }

  const dayAvailability = availability[date] ?? {};
  const bucketSize = (closeMins - openMins) / DAY_INDICATOR_SEGMENTS;

  return Array.from({ length: DAY_INDICATOR_SEGMENTS }, (_, i) => {
    const bucketStart = openMins + i * bucketSize;
    const bucketEnd = bucketStart + bucketSize;
    const hasFreeSlot = courts.some((court) =>
      (dayAvailability[court.id] ?? []).some((slot) => {
        const m = timeToMins(slot);
        return m >= bucketStart && m < bucketEnd;
      })
    );
    return hasFreeSlot ? "available" : "occupied";
  });
}

function formatCardDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

// One instance per DayRangeBlock (7/10/14 days) — all three render on every
// pageview, `className` (the page) is the only thing that decides which one
// is actually visible at the current viewport, so switching breakpoints is
// pure CSS with zero width-detection JS and zero hydration mismatch risk.
// Shared here (not duplicated per breakpoint, and now not duplicated per
// caller either) so mobile/desktop and player/admin always run the exact
// same selection/indicator logic.
export function DayRangeNav({
  className,
  variant,
  days,
  label,
  prevHref,
  nextHref,
  todayHref,
  selectedDate,
  todayStr,
  closedDates,
  courts,
  availability,
  openingMinsByDate,
  closingMinsByDate,
  onSelectDate,
}: {
  className: string;
  variant: "scroll" | "grid";
  days: DayRangeDay[];
  label: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  selectedDate: string;
  todayStr: string;
  closedDates: string[];
  courts: Array<{ id: string }>;
  availability: Record<string, Record<string, string[]>>;
  openingMinsByDate: Record<string, number>;
  closingMinsByDate: Record<string, number>;
  onSelectDate: (date: string) => void;
}) {
  // Only the 7-day (mobile) block still reads as "semana" — the wider
  // blocks are arbitrary N-day windows, not calendar weeks.
  const navWord = days.length === 7 ? "Semana" : "Rango";

  return (
    <div className={className}>
      {/* Range navigation */}
      <div className="flex items-center gap-2">
        <Link
          href={prevHref}
          className="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
          aria-label={`${navWord} anterior`}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <span className="flex-1 text-sm font-medium text-white text-center">{label}</span>
        <Link
          href={nextHref}
          className="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
          aria-label={`${navWord} siguiente`}
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
        <Link
          href={todayHref}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 text-brand-muted hover:text-white hover:border-white/30 transition-colors"
        >
          Hoy
        </Link>
      </div>

      {/* Day tabs — "scroll" reproduces the original mobile strip
          (fixed-width cards, horizontal scroll) untouched; "grid"
          distributes cards evenly across the full available width so wider
          blocks never leave empty space nor need horizontal scroll. */}
      <div
        className={
          variant === "scroll"
            ? "flex gap-1.5 overflow-x-auto pb-1 scrollbar-none"
            : "grid gap-1.5"
        }
        style={variant === "grid" ? { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` } : undefined}
      >
        {days.map((day) => {
          const isSelected = day.date === selectedDate;
          const isToday = day.date === todayStr;
          const isDayClosed = closedDates.includes(day.date);
          const indicator = buildDayIndicator(day.date, courts, availability, closedDates, openingMinsByDate, closingMinsByDate);
          const dayAriaLabel = `${formatCardDate(day.date)}${isSelected ? ", seleccionado" : ""}${isDayClosed ? ", cerrado" : ""}`;
          return (
            <button
              key={day.date}
              onClick={() => onSelectDate(day.date)}
              aria-pressed={isSelected}
              aria-label={dayAriaLabel}
              className={`flex flex-col items-center gap-1 ${variant === "scroll" ? "min-w-[56px] shrink-0" : ""} px-2 py-2 rounded-xl border text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg ${
                isSelected
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                  : day.isPast
                  ? "border-white/5 text-brand-muted/40"
                  : isDayClosed
                  ? "border-white/5 text-brand-muted/50"
                  : "border-white/10 text-brand-muted hover:border-white/20 hover:text-white"
              }`}
            >
              <span className="text-[10px] font-medium uppercase">{day.dayName}</span>
              <span className="flex items-center gap-1">
                <span className="text-base font-bold leading-tight">{day.dayNum}</span>
                {isToday && (
                  <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-brand-primary" : "bg-brand-muted/60"}`} />
                )}
              </span>
              <span className="flex items-center gap-[2px]" aria-hidden="true">
                {indicator.map((seg, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-2 rounded-[1px] ${
                      seg === "available"
                        ? isSelected ? "bg-brand-primary" : "bg-brand-primary/70"
                        : seg === "occupied"
                        ? "bg-white/20"
                        : "border border-dashed border-white/15"
                    }`}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
