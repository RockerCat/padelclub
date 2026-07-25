"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

// Purely a rendering tint layered on top of whatever the real
// available/occupied state already is — never a third availability value.
// "approved" paints an already-occupied slot green (the player's own
// confirmed reservation); "rejected" paints a slot soft-red whether it's
// occupied or free again (rejecting a request always frees the slot, so a
// rejected block's ticks are typically still bookable — this tint must
// never disable that); "pending" paints an already-occupied slot amber (the
// player's own pending request still blocks that slot for new requests,
// same as "approved"). Used by the player's activity-panel selection.
export type ContextRange = SlotRange & { tone: "approved" | "rejected" | "pending" };

// ─── Availability Legend ──────────────────────────────────────────────────────
// Shared once above the court card(s) (not repeated per card) — each state
// pairs a shape/texture with its color so meaning never depends on color
// alone. `showRequested` is only turned on by the admin review screen, which
// is the only context with a "Solicitud actual" state to explain.

export function AvailabilityLegend({
  showRequested = false,
  showPlayerRequestStates = false,
  showConfirmedState = false,
  occupiedLabelText = "Ocupado",
}: {
  showRequested?: boolean;
  /** Player page only — explains the approved/pending/rejected tints (never shown on the admin review screen, which has no such states of its own). */
  showPlayerRequestStates?: boolean;
  /**
   * OWNER/ADMIN Agenda only — adds "Confirmada" (green) and "Pendiente"
   * (amber) swatches, the exact colors already used elsewhere for these
   * states (same as Aprobada/Pendiente below), so Agenda's confirmed/
   * pending ticks have a matching legend entry instead of borrowing the
   * player-facing "Solicitud actual" wording.
   */
  showConfirmedState?: boolean;
  /**
   * Overrides the base striped swatch's label. Agenda passes "Bloqueada"
   * once Confirmada/Pendiente above cover the other occupied cases, so the
   * same swatch keeps meaning what it now actually represents there.
   */
  occupiedLabelText?: string;
}) {
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
        {occupiedLabelText}
      </span>
      {showConfirmedState && (
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[4px] border border-brand-primary bg-brand-primary/15" />
            Confirmada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[4px] border border-amber-400 bg-amber-400/15" />
            Pendiente
          </span>
        </>
      )}
      {showRequested && (
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] border border-amber-400 bg-amber-400/20" />
          Solicitud actual
        </span>
      )}
      {showPlayerRequestStates && (
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[4px] border border-brand-primary bg-brand-primary/15" />
            Aprobada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[4px] border border-amber-400 bg-amber-400/15" />
            Pendiente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[4px] border border-red-400/50 bg-red-400/10" />
            Rechazada
          </span>
        </>
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
// availability rule. Kept exactly as-is: still the only grouping the admin
// review screen renders (groupByDayPart below is player-only).
const AFTERNOON_START_MINS = 13 * 60;

// Mañana/Tarde/Noche boundaries for the player screen's groupByDayPart
// layout — classifies purely by each slot's own start time, never a new
// availability or pricing rule. Independent of AFTERNOON_START_MINS above,
// which the (unchanged) admin review screen still uses.
const MORNING_END_MINS = 12 * 60; // < 12:00 → Mañana
const EVENING_START_MINS = 18 * 60; // >= 18:00 → Noche

type DayPartGroup = { key: "morning" | "afternoon" | "evening"; label: string; ticks: string[] };

// Splits `grid` into Mañana/Tarde/Noche, dropping any group with no slots
// (a club that closes at 17:00 simply never produces a "evening" group) —
// callers render exactly the groups returned, never a fixed count of three.
function buildDayPartGroups(grid: string[]): DayPartGroup[] {
  return [
    { key: "morning" as const, label: "MAÑANA", ticks: grid.filter((t) => timeToMins(t) < MORNING_END_MINS) },
    {
      key: "afternoon" as const,
      label: "TARDE",
      ticks: grid.filter((t) => timeToMins(t) >= MORNING_END_MINS && timeToMins(t) < EVENING_START_MINS),
    },
    { key: "evening" as const, label: "NOCHE", ticks: grid.filter((t) => timeToMins(t) >= EVENING_START_MINS) },
  ].filter((group) => group.ticks.length > 0);
}

// Caps each row's height to roughly two lines of segments below the `lg`
// breakpoint only (mobile/tablet, where vertical space is scarce and a
// tall card pushes the rest of the page down) — a very granular day
// scrolls in place there instead of forcing the row wider than the card.
// From `lg` up (same breakpoint the page itself splits into calendar +
// side panel at) the cap lifts entirely: the row grows with its content
// and the page scrolls normally, so afternoon/evening slots are never
// hidden behind an easy-to-miss inner scrollbar.
const TIMELINE_ROW_HEIGHT_CLASSES = "max-h-[92px] overflow-y-auto lg:max-h-none lg:overflow-visible";

// Render-only priority when more than one of the player's own reservations
// lands on the same slot (see generalContextRanges below) — lower wins.
// Never used to alter any real data or status, purely which color paints on
// top when ranges collide.
const CONTEXT_TONE_PRIORITY: Record<ContextRange["tone"], number> = {
  approved: 0,
  pending: 1,
  rejected: 2,
};

// ─── Occupied-tick tooltip (Agenda desktop only) ───────────────────────────────
// Small, local to this file — the only place ticks are rendered — rather
// than a new global tooltip system. Position is computed once from the
// anchor tick's real on-screen rect (not guessed via CSS alone) so it never
// runs off the viewport regardless of where the tick sits in the grid;
// `fixed` positioning keeps it clear of the row's own scroll container.
const TOOLTIP_WIDTH = 220;
const TOOLTIP_GAP = 8;

function TickTooltip({
  anchorRef,
  content,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  content: ReactNode;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" } | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const placement: "top" | "bottom" = rect.top > 140 ? "top" : "bottom";
    const left = Math.max(
      TOOLTIP_GAP,
      Math.min(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_GAP)
    );
    const top = placement === "top" ? rect.top - TOOLTIP_GAP : rect.bottom + TOOLTIP_GAP;
    setPos({ top, left, placement });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pos) return null;

  return (
    <div
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-[500] rounded-xl border border-white/15 bg-[#0e3347] px-3 py-2.5 text-xs text-white shadow-xl leading-snug"
      style={{
        top: pos.top,
        left: pos.left,
        width: TOOLTIP_WIDTH,
        transform: pos.placement === "top" ? "translateY(-100%)" : undefined,
      }}
    >
      {content}
    </div>
  );
}

// Delays opening slightly (avoids flicker while the cursor just passes
// over the grid) and stays open while the cursor moves from the tick into
// the tooltip itself — closing only once it leaves both.
const TOOLTIP_OPEN_DELAY = 250;
const TOOLTIP_CLOSE_DELAY = 120;

// Touch devices fire a synthetic mouseenter right before a tap's click —
// without this guard a tap could schedule a tooltip that then hangs around
// after the tap already opened the side panel. Real mice/trackpads only.
function supportsHoverPointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function TimelineTick({
  label,
  labelSuffix,
  ariaLabel,
  clickable,
  onClick,
  className,
  style,
  tooltipContent,
  children,
}: {
  label: ReactNode;
  /** Never truncated (e.g. "+2") — stays fully visible even when `label` itself has to shrink to fit. */
  labelSuffix?: ReactNode;
  ariaLabel: string;
  clickable: boolean;
  onClick: (() => void) | undefined;
  className: string;
  style?: React.CSSProperties;
  tooltipContent: ReactNode | null;
  children?: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleOpen() {
    if (!tooltipContent || !supportsHoverPointer()) return;
    clearTimer();
    timerRef.current = setTimeout(() => setTooltipOpen(true), TOOLTIP_OPEN_DELAY);
  }

  function scheduleClose() {
    clearTimer();
    timerRef.current = setTimeout(() => setTooltipOpen(false), TOOLTIP_CLOSE_DELAY);
  }

  function openNow() {
    if (!tooltipContent) return;
    clearTimer();
    setTooltipOpen(true);
  }

  function closeNow() {
    clearTimer();
    setTooltipOpen(false);
  }

  useEffect(() => () => clearTimer(), []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={!clickable}
        onClick={onClick}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={openNow}
        onBlur={closeNow}
        aria-label={ariaLabel}
        className={className}
        style={style}
      >
        {/* Real CSS truncation (min-w-0 + truncate), not a fixed substring
            cut — a short label (a time, "Club") never visibly changes; a
            long one (a player's name) ellipsizes instead of overflowing,
            wrapping to a second line, or resizing the tick. labelSuffix
            ("+2") sits outside the truncating span so it's never the part
            that gets clipped. */}
        <span className="flex items-center justify-center w-full min-w-0 gap-0.5 px-0.5">
          <span className="truncate min-w-0">{label}</span>
          {labelSuffix != null && <span className="shrink-0">{labelSuffix}</span>}
        </span>
        {children}
      </button>
      {tooltipOpen && tooltipContent && (
        <TickTooltip anchorRef={buttonRef} content={tooltipContent} onMouseEnter={clearTimer} onMouseLeave={scheduleClose} />
      )}
    </>
  );
}

export function CourtAvailabilityCard({
  court,
  grid,
  slots,
  selectedRange,
  requestedRange,
  contextRange,
  generalContextRanges,
  onSelectSlot,
  onSelectOccupied,
  occupiedLabel,
  occupiedLabelSuffix,
  occupiedAriaLabel,
  occupiedPast,
  occupiedTooltip,
  interactive = true,
  groupByDayPart = false,
}: {
  court: Court;
  grid: string[];
  /** Duration-filtered, real selectable start times for this court/date/duration. */
  slots: string[];
  selectedRange?: SlotRange | null;
  /** The exact block a pending request would occupy — admin review only. */
  requestedRange?: SlotRange | null;
  /** Purely visual — the player's currently-selected activity-panel card, never a real state. */
  contextRange?: ContextRange | null;
  /**
   * Purely visual — every one of the player's own reservations on this
   * court/date, painted simultaneously when nothing is individually
   * selected (contextRange takes priority over this when both are passed,
   * though callers only ever pass one or the other). Collisions resolve via
   * CONTEXT_TONE_PRIORITY, never by altering data. No caption is rendered
   * for these — captions stay reserved for a real individual selection.
   */
  generalContextRanges?: ContextRange[];
  onSelectSlot?: (startTime: string) => void;
  /**
   * OWNER/ADMIN "Disponibilidad" view only (never passed by the player
   * screen — its occupied ticks stay exactly as before: not clickable).
   * When provided, occupied/requested/pending ticks become clickable too,
   * calling this instead of onSelectSlot so the caller can look up which
   * reservation (confirmed or pending) actually covers that tick and open
   * the same edit modal / review screen the Calendario view already uses —
   * this component never knows which reservation it is, only the tick.
   */
  onSelectOccupied?: (startTime: string) => void;
  /**
   * OWNER/ADMIN "Agenda" view only. When an occupied tick's label should
   * show something other than its time (e.g. the reservation's players'
   * initials), the caller supplies this — returning null/undefined falls
   * back to the tick's time, same as when this prop isn't passed at all
   * (the player screen never passes it).
   */
  occupiedLabel?: (startTime: string) => string | null | undefined;
  /**
   * OWNER/ADMIN "Agenda" view only. A trailing, never-truncated addition to
   * occupiedLabel — e.g. "+2" when a reservation has more than one
   * participant — rendered outside the truncating span so it stays fully
   * visible even when occupiedLabel's own text has to ellipsize.
   */
  occupiedLabelSuffix?: (startTime: string) => string | null | undefined;
  /**
   * OWNER/ADMIN "Agenda" view only. Overrides an occupied tick's aria-label
   * entirely (e.g. "Reserva confirmada, Cancha 3, de 19:30 a 21:00, Alex
   * New 11") — returning null/undefined falls back to the default
   * `${court}, ${tick}, ${stateLabel}` used everywhere else.
   */
  occupiedAriaLabel?: (startTime: string) => string | null | undefined;
  /**
   * OWNER/ADMIN "Agenda" view only. True for an occupied tick whose
   * confirmed reservation has already ended — slightly reduces the
   * confirmed/green tick's opacity so a past reservation still reads as
   * "was occupied" without competing visually with a future/in-progress
   * one. Never changes clickability or any other state.
   */
  occupiedPast?: (startTime: string) => boolean;
  /**
   * OWNER/ADMIN "Agenda" view only (never passed by the player screen —
   * no tooltip there). Desktop hover/keyboard-focus content for an
   * occupied tick — players, or the reservation's title/"Reserva del
   * club" when it has none. Returning null/undefined renders no tooltip
   * for that tick (blocked slots, or an occupied tick with no real
   * reservation behind it).
   */
  occupiedTooltip?: (startTime: string) => ReactNode | null | undefined;
  /** When false (admin review), ticks are read-only: no click, no hover affordance. */
  interactive?: boolean;
  /**
   * Player screen only (default false — admin review keeps its original
   * Mañana / Tarde y noche split untouched). Groups the same grid into
   * Mañana/Tarde/Noche, stacked on narrow cards and laid out in as many
   * columns as there are non-empty groups once the card itself (not the
   * viewport — this card can render at very different widths depending on
   * how many court cards fit per row) is wide enough, via a container query
   * on the card root below.
   */
  groupByDayPart?: boolean;
}) {
  const slotSet = new Set(slots);
  const selectedStart = selectedRange ? timeToMins(selectedRange.startTime) : null;
  const selectedEnd = selectedRange ? selectedStart! + selectedRange.duration : null;
  const requestedStart = requestedRange ? timeToMins(requestedRange.startTime) : null;
  const requestedEnd = requestedRange ? requestedStart! + requestedRange.duration : null;
  const contextStart = contextRange ? timeToMins(contextRange.startTime) : null;
  const contextEnd = contextRange ? contextStart! + contextRange.duration : null;
  const hasFeatures = court.is_indoor != null || !!court.surface;

  // Real availability state — untouched by the purely-visual context tint
  // below, so clickability (a rejected slot may still be genuinely bookable)
  // never changes because of it.
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

  // contextRange (an individual selection) always wins when present;
  // otherwise falls back to whichever of generalContextRanges covers this
  // tick, highest-priority tone first when more than one does.
  function contextTone(tick: string): "approved" | "rejected" | "pending" | null {
    const tickMins = timeToMins(tick);
    if (contextStart !== null && contextEnd !== null) {
      return tickMins >= contextStart && tickMins < contextEnd ? contextRange!.tone : null;
    }
    if (!generalContextRanges || generalContextRanges.length === 0) return null;
    let best: ContextRange["tone"] | null = null;
    for (const range of generalContextRanges) {
      const rStart = timeToMins(range.startTime);
      const rEnd = rStart + range.duration;
      if (tickMins < rStart || tickMins >= rEnd) continue;
      if (best === null || CONTEXT_TONE_PRIORITY[range.tone] < CONTEXT_TONE_PRIORITY[best]) {
        best = range.tone;
      }
    }
    return best;
  }

  function renderRow(ticks: string[]) {
    return (
      <div className={`-mr-0.5 pr-0.5 lg:mr-0 lg:pr-0 ${TIMELINE_ROW_HEIGHT_CLASSES}`}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(46px, 1fr))" }}>
          {ticks.map((tick) => {
            const state = segmentState(tick);
            const tone = state === "selected" || state === "requested" ? null : contextTone(tick);
            const clickable =
              interactive && (state === "available" || (state === "occupied" && !!onSelectOccupied));
            const isPast = state === "occupied" && !!occupiedPast?.(tick);
            const stateLabel =
              state === "available" ? "disponible" : state === "selected" ? "seleccionado" : state === "requested" ? "solicitud actual" : "ocupado";
            const toneLabel =
              tone === "approved"
                ? ", tu reserva aprobada"
                : tone === "rejected"
                ? ", tu solicitud rechazada"
                : tone === "pending"
                ? ", tu solicitud pendiente"
                : "";
            const ariaOverride = state === "occupied" ? occupiedAriaLabel?.(tick) : null;
            // Desktop-only hover/focus content — only for a tick that's
            // actually occupied AND has real tooltip content to show
            // (never available/blocked/no-reservation ticks).
            const tooltipContent = state === "occupied" ? occupiedTooltip?.(tick) ?? null : null;
            return (
              <TimelineTick
                key={tick}
                ariaLabel={ariaOverride ?? `${court.name}, ${tick}, ${stateLabel}${toneLabel}`}
                clickable={clickable}
                tooltipContent={tooltipContent}
                onClick={
                  clickable
                    ? () => (state === "available" ? onSelectSlot?.(tick) : onSelectOccupied?.(tick))
                    : undefined
                }
                className={`relative h-10 rounded-lg border text-[10px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg flex items-center justify-center ${
                  isPast ? "opacity-75" : ""
                } ${
                  state === "selected"
                    ? "bg-brand-primary border-brand-primary text-brand-bg"
                    : state === "requested"
                    ? "bg-amber-400/20 border-amber-400 text-amber-300"
                    : tone === "approved"
                    ? clickable
                      ? "bg-brand-primary/15 border-brand-primary text-brand-primary hover:brightness-110 cursor-pointer"
                      : "bg-brand-primary/15 border-brand-primary text-brand-primary cursor-not-allowed"
                    : tone === "rejected"
                    ? clickable
                      ? "bg-red-400/10 border-red-400/50 text-red-200 hover:border-brand-primary hover:bg-brand-primary/10 cursor-pointer"
                      : "bg-red-400/10 border-red-400/50 text-red-200 cursor-not-allowed"
                    : tone === "pending"
                    ? clickable
                      ? "bg-amber-400/15 border-amber-400 text-amber-300 hover:brightness-110 cursor-pointer"
                      : "bg-amber-400/15 border-amber-400 text-amber-300 cursor-not-allowed"
                    : state === "available"
                    ? clickable
                      ? "bg-white/5 border-white/15 text-white hover:border-brand-primary hover:bg-brand-primary/10 cursor-pointer"
                      : "bg-white/5 border-white/15 text-white cursor-default"
                    : clickable
                    ? "bg-white/[0.02] border-white/5 text-brand-muted/60 hover:border-brand-primary hover:bg-brand-primary/10 cursor-pointer"
                    : "bg-white/[0.02] border-white/5 text-brand-muted/40 cursor-not-allowed"
                }`}
                style={
                  state === "occupied" && !tone
                    ? { backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 3px, transparent 3px 6px)" }
                    : undefined
                }
                label={state === "occupied" && occupiedLabel ? occupiedLabel(tick) ?? tick : tick}
                labelSuffix={state === "occupied" ? occupiedLabelSuffix?.(tick) : null}
              >
                {state === "selected" && (
                  <Check className="w-2.5 h-2.5 absolute top-0.5 right-0.5" strokeWidth={3} />
                )}
                {state === "requested" && (
                  <Clock className="w-2.5 h-2.5 absolute top-0.5 right-0.5" strokeWidth={3} />
                )}
              </TimelineTick>
            );
          })}
        </div>
      </div>
    );
  }

  const morning = grid.filter((t) => timeToMins(t) < AFTERNOON_START_MINS);
  const afternoon = grid.filter((t) => timeToMins(t) >= AFTERNOON_START_MINS);
  const dayPartGroups = groupByDayPart ? buildDayPartGroups(grid) : [];

  return (
    // @container: lets groupByDayPart's column count react to this card's
    // own rendered width (which varies with how many cards fit per row in
    // the parent's auto-fit grid) instead of the viewport — inert for the
    // admin review screen, which renders no @-variant classes.
    <div className="@container rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
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

      {contextRange && (
        <p
          className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 text-center border ${
            contextRange.tone === "approved"
              ? "text-brand-primary bg-brand-primary/10 border-brand-primary/20"
              : contextRange.tone === "rejected"
              ? "text-red-300 bg-red-400/10 border-red-400/30"
              : "text-amber-300 bg-amber-400/10 border-amber-400/30"
          }`}
        >
          {contextRange.tone === "approved"
            ? "Tu reserva aprobada"
            : contextRange.tone === "rejected"
            ? "Tu solicitud rechazada"
            : "Tu solicitud está pendiente"}
          : {contextRange.startTime} – {addMinutes(contextRange.startTime, contextRange.duration)}
        </p>
      )}

      {grid.length === 0 ? (
        <p className="text-xs text-brand-muted/60">Sin bloques disponibles hoy.</p>
      ) : groupByDayPart ? (
        // Stacked by default (mobile and any narrow card); once the card
        // itself is wide enough (@lg, a container query on the root above —
        // not a viewport breakpoint), lays out exactly as many columns as
        // there are non-empty groups so a club missing e.g. "Noche" never
        // leaves an empty column. --daypart-count only feeds the @lg tier;
        // the narrow tier below it always stacks regardless of its value.
        <div
          className="grid grid-cols-1 gap-4 @lg:grid-cols-[repeat(var(--daypart-count),minmax(0,1fr))]"
          style={{ "--daypart-count": dayPartGroups.length } as React.CSSProperties}
        >
          {dayPartGroups.map((group, i) => (
            <div
              key={group.key}
              className={`flex flex-col gap-1.5 min-w-0 ${i > 0 ? "@lg:border-l @lg:border-white/5 @lg:pl-4" : ""}`}
            >
              <p className="text-[11px] font-medium text-brand-muted/70 uppercase tracking-wider">{group.label}</p>
              {renderRow(group.ticks)}
            </div>
          ))}
        </div>
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
