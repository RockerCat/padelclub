"use client";

import { Check, Clock } from "lucide-react";
import { CourtIllustration, getSurfaceLabel } from "@/components/courts/CourtIllustration";
import { timeToMins, addMinutes } from "@/lib/courtAvailability";

// ─── Shared types ─────────────────────────────────────────────────────────────
// Pure time/grid helpers (timeToMins, minsToTime, addMinutes, buildDayGrid)
// live in @/lib/courtAvailability — server-safe, no "use client", importable
// from Server Components. Only presentation-only types/components stay here.

export type Court = { id: string; name: string; surface: string | null; is_indoor: boolean | null };

// Visual-only state for a single timeline segment. "occupied" covers both an
// actual booking AND "not enough room before closing/next booking for the
// currently selected duration". "requested" is the admin-review-only state:
// the exact block a pending request would occupy if approved — must never
// be confused with "available", "occupied" or "selected".
export type TimelineSegmentState = "available" | "occupied" | "selected" | "requested";

export type SlotRange = { startTime: string; duration: number };

// ─── Availability Legend ──────────────────────────────────────────────────────
// Shared once above the court card(s) (not repeated per card) — each state
// pairs a shape/texture with its color so meaning never depends on color
// alone. `showRequested` is only turned on by the admin review screen, which
// is the only context with a "Solicitud actual" state to explain.

export function AvailabilityLegend({ showRequested = false }: { showRequested?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-brand-muted">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-[4px] border border-white/15 bg-white/5" />
        Disponible
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="w-3 h-3 rounded-[4px] border border-white/10 bg-white/[0.02]"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 4px)" }}
        />
        Ocupado
      </span>
      {showRequested && (
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] border border-amber-400 bg-amber-400/20" />
          Solicitud actual
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-[4px] bg-brand-primary flex items-center justify-center">
          <Check className="w-2 h-2 text-brand-bg" strokeWidth={3} />
        </span>
        Seleccionado
      </span>
    </div>
  );
}

// ─── Court Availability Card ──────────────────────────────────────────────────

// Morning/afternoon split boundary — 13:00, per spec. Purely how the same
// real grid/slots are grouped into two visible rows, never a new
// availability rule.
const AFTERNOON_START_MINS = 13 * 60;

// Caps each row's default height to roughly two lines of segments before it
// scrolls internally (vertically, never horizontally) — most club schedules
// fit in two lines; a very granular one scrolls in place instead of forcing
// the row wider than the card.
const TIMELINE_ROW_MAX_HEIGHT = "92px";

export function CourtAvailabilityCard({
  court,
  grid,
  slots,
  selectedRange,
  requestedRange,
  onSelectSlot,
  interactive = true,
}: {
  court: Court;
  grid: string[];
  /** Duration-filtered, real selectable start times for this court/date/duration. */
  slots: string[];
  selectedRange?: SlotRange | null;
  /** The exact block a pending request would occupy — admin review only. */
  requestedRange?: SlotRange | null;
  onSelectSlot?: (startTime: string) => void;
  /** When false (admin review), ticks are read-only: no click, no hover affordance. */
  interactive?: boolean;
}) {
  const slotSet = new Set(slots);
  const selectedStart = selectedRange ? timeToMins(selectedRange.startTime) : null;
  const selectedEnd = selectedRange ? selectedStart! + selectedRange.duration : null;
  const requestedStart = requestedRange ? timeToMins(requestedRange.startTime) : null;
  const requestedEnd = requestedRange ? requestedStart! + requestedRange.duration : null;
  const hasFeatures = court.is_indoor != null || !!court.surface;

  function segmentState(tick: string): TimelineSegmentState {
    const tickMins = timeToMins(tick);
    if (selectedStart !== null && selectedEnd !== null && tickMins >= selectedStart && tickMins < selectedEnd) {
      return "selected";
    }
    if (requestedStart !== null && requestedEnd !== null && tickMins >= requestedStart && tickMins < requestedEnd) {
      return "requested";
    }
    return slotSet.has(tick) ? "available" : "occupied";
  }

  function renderRow(ticks: string[]) {
    return (
      <div className="overflow-y-auto -mr-0.5 pr-0.5" style={{ maxHeight: TIMELINE_ROW_MAX_HEIGHT }}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(46px, 1fr))" }}>
          {ticks.map((tick) => {
            const state = segmentState(tick);
            const clickable = interactive && state === "available";
            const stateLabel =
              state === "available" ? "disponible" : state === "selected" ? "seleccionado" : state === "requested" ? "solicitud actual" : "ocupado";
            return (
              <button
                key={tick}
                type="button"
                disabled={!clickable}
                onClick={clickable ? () => onSelectSlot?.(tick) : undefined}
                aria-label={`${court.name}, ${tick}, ${stateLabel}`}
                className={`relative h-10 rounded-lg border text-[10px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg flex items-center justify-center ${
                  state === "selected"
                    ? "bg-brand-primary border-brand-primary text-brand-bg"
                    : state === "requested"
                    ? "bg-amber-400/20 border-amber-400 text-amber-300"
                    : state === "available"
                    ? clickable
                      ? "bg-white/5 border-white/15 text-white hover:border-brand-primary hover:bg-brand-primary/10 cursor-pointer"
                      : "bg-white/5 border-white/15 text-white cursor-default"
                    : "bg-white/[0.02] border-white/5 text-brand-muted/40 cursor-not-allowed"
                }`}
                style={
                  state === "occupied"
                    ? { backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 3px, transparent 3px 6px)" }
                    : undefined
                }
              >
                {tick}
                {state === "selected" && (
                  <Check className="w-2.5 h-2.5 absolute top-0.5 right-0.5" strokeWidth={3} />
                )}
                {state === "requested" && (
                  <Clock className="w-2.5 h-2.5 absolute top-0.5 right-0.5" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const morning = grid.filter((t) => timeToMins(t) < AFTERNOON_START_MINS);
  const afternoon = grid.filter((t) => timeToMins(t) >= AFTERNOON_START_MINS);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <CourtIllustration surface={court.surface} className="w-16 h-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{court.name}</p>
          {hasFeatures && (
            <p className="text-xs text-brand-muted truncate">
              {court.is_indoor === true ? "Indoor" : court.is_indoor === false ? "Outdoor" : ""}
              {court.is_indoor != null && court.surface ? " · " : ""}
              {court.surface ? getSurfaceLabel(court.surface) : ""}
            </p>
          )}
        </div>
      </div>

      {selectedRange && (
        <p className="text-xs font-semibold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-lg px-2.5 py-1.5 text-center">
          Seleccionado: {selectedRange.startTime} – {addMinutes(selectedRange.startTime, selectedRange.duration)}
        </p>
      )}

      {requestedRange && (
        <p className="text-xs font-semibold text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2.5 py-1.5 text-center">
          Solicitud actual: {requestedRange.startTime} – {addMinutes(requestedRange.startTime, requestedRange.duration)}
        </p>
      )}

      {grid.length === 0 ? (
        <p className="text-xs text-brand-muted/60">Sin bloques disponibles hoy.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {morning.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-brand-muted/70 uppercase tracking-wider">Mañana</p>
              {renderRow(morning)}
            </div>
          )}
          {afternoon.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-brand-muted/70 uppercase tracking-wider">Tarde y noche</p>
              {renderRow(afternoon)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
