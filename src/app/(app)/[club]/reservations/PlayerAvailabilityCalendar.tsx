"use client";

import { useState, useEffect, useActionState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Check, CalendarOff, Clock } from "lucide-react";
import { requestReservation } from "./actions";
import type { RequestFormState } from "./actions";
import type { MyReservation } from "./page";
import { durationOptions, durationLabel } from "@/lib/durations";
import { CourtIllustration, getSurfaceLabel } from "@/components/courts/CourtIllustration";

// ─── Types ────────────────────────────────────────────────────────────────────

type WeekDayData = {
  date: string;
  dayName: string;
  dayNum: number;
  monthName: string;
  isPast: boolean;
};

type Court = { id: string; name: string; surface: string | null; is_indoor: boolean | null };

type BlockedWindow = [number, number];

// Visual-only state for a single timeline segment — derived entirely from the
// same availability/blocked data the old flat button grid used, never a new
// business rule. "occupied" covers both an actual booking AND "not enough
// room before closing/next booking for the currently selected duration" —
// the spec explicitly groups those as one non-selectable state.
type TimelineSegmentState = "available" | "occupied" | "selected";

// Day-card summary indicator — coarse, club-wide (not per-court) buckets
// built from the same per-day/per-court `availability` already sent by the
// server. "closed" = no operating hours that day.
type DaySegmentState = "available" | "occupied" | "closed";

interface PlayerAvailabilityCalendarProps {
  weekDays: WeekDayData[];
  courts: Court[];
  availability: Record<string, Record<string, string[]>>;
  closedDates: string[];
  todayStr: string;
  weekLabel: string;
  prevWeekHref: string;
  nextWeekHref: string;
  todayHref: string;
  clubId: string;
  defaultSelectedDate: string;
  allowedDurations: number[];
  openingMinsByDate: Record<string, number>;
  closingMinsByDate: Record<string, number>;
  blockedByDate: Record<string, Record<string, BlockedWindow[]>>;
  myReservations: MyReservation[];
}

type ModalSlot = {
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function addMinutes(time: string, mins: number): string {
  return minsToTime(timeToMins(time) + mins);
}

function formatModalDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function formatCardDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function filterSlotsByDuration(
  baseSlots: string[],
  duration: number,
  closingMins: number | undefined,
  blocked: BlockedWindow[],
): string[] {
  return baseSlots.filter((slot) => {
    const start = timeToMins(slot);
    const end = start + duration;
    if (closingMins !== undefined && end > closingMins) return false;
    return !blocked.some(([rStart, rEnd]) => start < rEnd && end > rStart);
  });
}

const DAY_INDICATOR_SEGMENTS = 5;

// Coarse day-level summary for the day cards — buckets the operating window
// into a handful of equal ranges and marks each "available" if ANY court has
// a free slot inside it. Deliberately imprecise per-court (spec: this is a
// day-level summary, not a per-court readout) — built only from the real
// `availability` already computed server-side, no new rule.
function buildDayIndicator(
  date: string,
  courts: Pick<Court, "id">[],
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

// Rebuilds the same 30-minute base grid the server generates in
// computeAvailability (page.tsx) — same open/close bounds, same minDuration
// gate, same step — purely so the timeline has something to render ticks
// for. Whether a given tick is selectable still comes from the real
// `availability`/`filterSlotsByDuration` data, never from this grid alone.
function buildDayGrid(openMins: number | undefined, closeMins: number | undefined, minDuration: number): string[] {
  if (openMins === undefined || closeMins === undefined) return [];
  const grid: string[] = [];
  for (let t = openMins; t + minDuration <= closeMins; t += 30) grid.push(minsToTime(t));
  return grid;
}

// Groups reservations by date, returns dates in ascending order
function groupByDate(reservations: MyReservation[]): Array<{ date: string; items: MyReservation[] }> {
  const map = new Map<string, MyReservation[]>();
  for (const r of reservations) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: { label: "Pendiente de aprobación", dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  confirmed: { label: "Confirmada", dot: "bg-brand-primary", text: "text-brand-primary", bg: "bg-brand-primary/10 border-brand-primary/20" },
  cancelled: { label: "Cancelada", dot: "bg-red-400/60", text: "text-brand-muted", bg: "bg-white/[0.03] border-white/5" },
} as const;

function StatusBadge({ status }: { status: MyReservation["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Next Reservation Card ────────────────────────────────────────────────────

const NEXT_CARD_STATUS = {
  confirmed: {
    title: "Tu próxima reserva",
    cardClass: "bg-brand-primary/5 border-brand-primary/20",
    titleClass: "text-brand-primary",
  },
  pending: {
    title: "Solicitud en revisión",
    cardClass: "bg-amber-400/5 border-amber-400/20",
    titleClass: "text-amber-400",
  },
} as const;

function NextReservationCard({
  reservation,
  showHistoryLink,
}: {
  reservation: MyReservation | null;
  showHistoryLink: boolean;
}) {
  function scrollToHistory() {
    document.getElementById("mis-solicitudes")?.scrollIntoView({ behavior: "smooth" });
  }

  if (!reservation) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-medium text-white">No tienes reservas próximas</p>
        <p className="text-sm text-brand-muted mt-1">
          Elige un horario disponible para solicitar una reserva.
        </p>
        {showHistoryLink && (
          <button
            onClick={scrollToHistory}
            className="mt-3 text-xs text-brand-muted hover:text-white transition-colors"
          >
            Ver mis solicitudes →
          </button>
        )}
      </div>
    );
  }

  const cfg = NEXT_CARD_STATUS[reservation.status as keyof typeof NEXT_CARD_STATUS];
  const start = reservation.start_time.slice(0, 5);
  const end = addMinutes(start, reservation.duration_minutes);

  return (
    <div className={`rounded-xl border p-4 ${cfg.cardClass}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className={`text-sm font-semibold ${cfg.titleClass}`}>{cfg.title}</p>
        <StatusBadge status={reservation.status} />
      </div>
      <p className="text-sm text-white font-medium capitalize">
        {formatCardDate(reservation.date)}
      </p>
      <p className="text-sm text-brand-muted mt-1">
        {start} – {end} · {reservation.courtName} · {durationLabel(reservation.duration_minutes)}
      </p>
      {reservation.status === "pending" && (
        <p className="text-xs text-amber-400/70 mt-2">
          El administrador la confirmará pronto.
        </p>
      )}
      {showHistoryLink && (
        <button
          onClick={scrollToHistory}
          className="mt-3 text-xs text-brand-muted hover:text-white transition-colors"
        >
          Ver mis solicitudes →
        </button>
      )}
    </div>
  );
}

// ─── My Reservations Section ──────────────────────────────────────────────────

function MyReservationsSection({ reservations }: { reservations: MyReservation[] }) {
  const grouped = groupByDate(reservations);

  return (
    <div id="mis-solicitudes" className="mt-8 pt-6 border-t border-white/10">
      <h2 className="text-sm font-semibold text-white mb-4">Mis solicitudes</h2>

      {grouped.length === 0 ? (
        <div className="flex items-center gap-3 py-6 text-brand-muted/60">
          <Clock className="w-4 h-4 shrink-0" />
          <p className="text-sm">Aún no tienes solicitudes de reserva.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(({ date, items }) => (
            <div key={date}>
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-2 capitalize">
                {formatCardDate(date)}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((r) => {
                  const startFmt = r.start_time.slice(0, 5);
                  const endFmt = addMinutes(startFmt, r.duration_minutes);
                  const isCancelled = r.status === "cancelled";
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border p-4 flex flex-col gap-2 transition-opacity ${
                        isCancelled ? "opacity-50 border-white/5 bg-white/[0.02]" : "border-white/10 bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-semibold text-white">
                          {startFmt} – {endFmt}
                        </span>
                        <span className="text-brand-muted/60">·</span>
                        <span className="text-brand-muted">{r.courtName}</span>
                        <span className="text-brand-muted/60">·</span>
                        <span className="text-brand-muted">{durationLabel(r.duration_minutes)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Request Modal ────────────────────────────────────────────────────────────

function RequestModal({
  courtId,
  courtName,
  date,
  startTime,
  clubId,
  allowedDurations,
  onClose,
  onSuccess,
}: ModalSlot & {
  clubId: string;
  allowedDurations: number[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const durations = durationOptions(allowedDurations);
  const [duration, setDuration] = useState(allowedDurations[0] ?? 60);
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    requestReservation.bind(null, clubId),
    {},
  );

  useEffect(() => {
    if (state?.success) onSuccess();
  }, [state?.success, onSuccess]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const endTime = addMinutes(startTime, duration);
  const dateLabel = formatModalDate(date);

  return (
    <div className="fixed inset-0 z-[500] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full md:w-[420px] bg-brand-surface border border-white/10 rounded-t-2xl md:rounded-2xl flex flex-col max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-base font-bold text-white">Solicitar reserva</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details */}
        <div className="px-5 pt-4 pb-2 flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-brand-muted">Cancha</span>
            <span className="text-white font-medium">{courtName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-brand-muted">Fecha</span>
            <span className="text-white font-medium capitalize">{dateLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-brand-muted">Hora</span>
            <span className="text-white font-medium">{startTime} – {endTime}</span>
          </div>
        </div>

        {/* Form */}
        <form action={formAction} className="px-5 pb-5 pt-3 flex flex-col gap-4">
          <input type="hidden" name="court_id" value={courtId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="start_time" value={startTime} />
          <input type="hidden" name="duration_minutes" value={String(duration)} />

          {/* Duration selector */}
          <div>
            <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">
              Duración
            </p>
            <div className={`grid gap-2 ${durations.length <= 2 ? "grid-cols-2" : durations.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
              {durations.map(({ minutes, label }) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDuration(minutes)}
                  className={`py-2 px-1 rounded-xl text-xs font-medium border transition-colors ${
                    duration === minutes
                      ? "border-brand-primary text-brand-primary bg-brand-primary/10"
                      : "border-white/10 text-brand-muted hover:border-white/30 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* End time preview */}
          <p className="text-xs text-brand-muted text-center">
            Reserva de{" "}
            <span className="text-white font-medium">{startTime} a {endTime}</span>
          </p>

          {state?.error && (
            <p className="text-sm text-red-400 text-center bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "#001A24" }}
          >
            {pending ? "Enviando…" : "Enviar solicitud"}
          </button>

          <p className="text-xs text-brand-muted text-center leading-relaxed">
            Tu solicitud quedará pendiente de aprobación por el administrador.
          </p>
        </form>
      </div>
    </div>
  );
}

// ─── Availability Legend ──────────────────────────────────────────────────────
// Shared once above the court cards (not repeated per card) — compact, and
// each state pairs a shape/texture with its color so meaning never depends
// on color alone.

function AvailabilityLegend() {
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

function CourtAvailabilityCard({
  court,
  grid,
  slots,
  selectedRange,
  onSelectSlot,
}: {
  court: Court;
  grid: string[];
  /** Duration-filtered, real selectable start times for this court/date/duration. */
  slots: string[];
  selectedRange: { startTime: string; duration: number } | null;
  onSelectSlot: (startTime: string) => void;
}) {
  const slotSet = new Set(slots);
  const selectedStart = selectedRange ? timeToMins(selectedRange.startTime) : null;
  const selectedEnd = selectedRange ? selectedStart! + selectedRange.duration : null;
  const hasFeatures = court.is_indoor != null || !!court.surface;

  function segmentState(tick: string): TimelineSegmentState {
    const tickMins = timeToMins(tick);
    if (selectedStart !== null && selectedEnd !== null && tickMins >= selectedStart && tickMins < selectedEnd) {
      return "selected";
    }
    return slotSet.has(tick) ? "available" : "occupied";
  }

  function renderRow(ticks: string[]) {
    return (
      <div className="overflow-y-auto -mr-0.5 pr-0.5" style={{ maxHeight: TIMELINE_ROW_MAX_HEIGHT }}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(46px, 1fr))" }}>
          {ticks.map((tick) => {
            const state = segmentState(tick);
            const stateLabel = state === "available" ? "disponible" : state === "selected" ? "seleccionado" : "ocupado";
            return (
              <button
                key={tick}
                type="button"
                disabled={state === "occupied"}
                onClick={() => onSelectSlot(tick)}
                aria-label={`${court.name}, ${tick}, ${stateLabel}`}
                className={`relative h-10 rounded-lg border text-[10px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg flex items-center justify-center ${
                  state === "selected"
                    ? "bg-brand-primary border-brand-primary text-brand-bg"
                    : state === "available"
                    ? "bg-white/5 border-white/15 text-white hover:border-brand-primary hover:bg-brand-primary/10 cursor-pointer"
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlayerAvailabilityCalendar({
  weekDays,
  courts,
  availability,
  closedDates,
  todayStr,
  weekLabel,
  prevWeekHref,
  nextWeekHref,
  todayHref,
  clubId,
  defaultSelectedDate,
  allowedDurations,
  openingMinsByDate,
  closingMinsByDate,
  blockedByDate,
  myReservations,
}: PlayerAvailabilityCalendarProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(defaultSelectedDate);
  const [selectedDuration, setSelectedDuration] = useState(allowedDurations[0] ?? 60);
  const [modalSlot, setModalSlot] = useState<ModalSlot | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const durations = durationOptions(allowedDurations);
  const nextReservation =
    myReservations.find((r) => r.status === "pending" || r.status === "confirmed") ?? null;
  const showHistoryLink = myReservations.length > 0;

  useEffect(() => {
    if (!successBanner) return;
    const t = setTimeout(() => setSuccessBanner(null), 5000);
    return () => clearTimeout(t);
  }, [successBanner]);

  const handleSuccess = useCallback(() => {
    setModalSlot(null);
    setSuccessBanner("Tu solicitud fue enviada. El administrador la confirmará pronto.");
    router.refresh(); // Re-fetches server data → updates availability + Mis solicitudes
  }, [router]);

  const isClosed = closedDates.includes(selectedDate);
  const openingMins = openingMinsByDate[selectedDate];
  const closingMins = closingMinsByDate[selectedDate];
  const baseAvailability = availability[selectedDate] ?? {};
  const dateBlocked = blockedByDate[selectedDate] ?? {};
  const minDuration = Math.min(...allowedDurations);

  // Real, duration-aware selectable start times per court — identical
  // computation as before, just no longer used to hide fully-booked courts:
  // the timeline itself is expected to show "ocupado" segments, not omit
  // the court entirely.
  const courtsWithSlots = courts.map((c) => ({
    ...c,
    slots: filterSlotsByDuration(
      baseAvailability[c.id] ?? [],
      selectedDuration,
      closingMins,
      dateBlocked[c.id] ?? [],
    ),
  }));

  // Same 30-minute grid the server built for this date (page.tsx's
  // computeAvailability), rebuilt client-side purely to draw ticks — shared
  // by every court card since operating hours are club-wide, not per-court.
  const dayGrid = buildDayGrid(openingMins, closingMins, minDuration);

  function selectedRangeFor(courtId: string) {
    return modalSlot && modalSlot.courtId === courtId
      ? { startTime: modalSlot.startTime, duration: selectedDuration }
      : null;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Next reservation card */}
      <NextReservationCard reservation={nextReservation} showHistoryLink={showHistoryLink} />

      {/* Success banner */}
      {successBanner && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-sm">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <Link
          href={prevWeekHref}
          className="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <span className="flex-1 text-sm font-medium text-white text-center">{weekLabel}</span>
        <Link
          href={nextWeekHref}
          className="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Semana siguiente"
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

      {/* Day tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {weekDays.map((day) => {
          const isSelected = day.date === selectedDate;
          const isToday = day.date === todayStr;
          const isDayClosed = closedDates.includes(day.date);
          const indicator = buildDayIndicator(day.date, courts, availability, closedDates, openingMinsByDate, closingMinsByDate);
          const dayAriaLabel = `${formatCardDate(day.date)}${isSelected ? ", seleccionado" : ""}${isDayClosed ? ", cerrado" : ""}`;
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              aria-pressed={isSelected}
              aria-label={dayAriaLabel}
              className={`flex flex-col items-center gap-1 min-w-[56px] px-2 py-2 rounded-xl border text-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg ${
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

      {/* Duration selector — compact, only shown when there are multiple options and day is open */}
      {!isClosed && durations.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-brand-muted uppercase tracking-wider">Duración</span>
          <div className="flex gap-1.5 flex-wrap">
            {durations.map(({ minutes, label }) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setSelectedDuration(minutes)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  selectedDuration === minutes
                    ? "border-brand-primary text-brand-primary bg-brand-primary/10"
                    : "border-white/10 text-brand-muted hover:border-white/20 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Court cards + timeline */}
      <div className="flex flex-col gap-3">
        {isClosed ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
              <CalendarOff className="w-5 h-5 text-brand-muted" />
            </div>
            <p className="text-brand-muted text-sm">Club cerrado este día</p>
          </div>
        ) : (
          <>
            <AvailabilityLegend />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {courtsWithSlots.map((court) => (
                <CourtAvailabilityCard
                  key={court.id}
                  court={court}
                  grid={dayGrid}
                  slots={court.slots}
                  selectedRange={selectedRangeFor(court.id)}
                  onSelectSlot={(startTime) =>
                    setModalSlot({ courtId: court.id, courtName: court.name, date: selectedDate, startTime })
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Mis solicitudes */}
      <MyReservationsSection reservations={myReservations} />

      {/* Request modal */}
      {modalSlot && (
        <RequestModal
          key={`${modalSlot.courtId}-${modalSlot.date}-${modalSlot.startTime}`}
          {...modalSlot}
          clubId={clubId}
          allowedDurations={allowedDurations}
          onClose={() => setModalSlot(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
