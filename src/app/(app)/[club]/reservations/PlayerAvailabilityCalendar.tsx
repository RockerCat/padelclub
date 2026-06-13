"use client";

import { useState, useEffect, useActionState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Check, CalendarOff, Clock } from "lucide-react";
import { requestReservation } from "./actions";
import type { RequestFormState } from "./actions";
import type { MyReservation } from "./page";
import { durationOptions, durationLabel } from "@/lib/durations";

// ─── Types ────────────────────────────────────────────────────────────────────

type WeekDayData = {
  date: string;
  dayName: string;
  dayNum: number;
  monthName: string;
  isPast: boolean;
};

type Court = { id: string; name: string };

type BlockedWindow = [number, number];

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

// ─── My Reservations Section ──────────────────────────────────────────────────

function MyReservationsSection({ reservations }: { reservations: MyReservation[] }) {
  const grouped = groupByDate(reservations);

  return (
    <div className="mt-8 pt-6 border-t border-white/10">
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
  const closingMins = closingMinsByDate[selectedDate];
  const baseAvailability = availability[selectedDate] ?? {};
  const dateBlocked = blockedByDate[selectedDate] ?? {};

  const courtsWithSlots = courts
    .map((c) => ({
      ...c,
      slots: filterSlotsByDuration(
        baseAvailability[c.id] ?? [],
        selectedDuration,
        closingMins,
        dateBlocked[c.id] ?? [],
      ),
    }))
    .filter((c) => c.slots.length > 0);

  const hasAnySlots = courtsWithSlots.length > 0;

  return (
    <div className="flex flex-col gap-4">
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
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`flex flex-col items-center min-w-[52px] px-2 py-2 rounded-xl border text-center transition-colors shrink-0 ${
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
              <span className="text-base font-bold leading-tight">{day.dayNum}</span>
              {isToday && (
                <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-brand-primary" : "bg-brand-muted/60"}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Duration selector — only shown when there are multiple options and day is open */}
      {!isClosed && durations.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {durations.map(({ minutes, label }) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setSelectedDuration(minutes)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                selectedDuration === minutes
                  ? "border-brand-primary text-brand-primary bg-brand-primary/10"
                  : "border-white/10 text-brand-muted hover:border-white/20 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Slot grid */}
      <div className="flex flex-col gap-5">
        {isClosed ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
              <CalendarOff className="w-5 h-5 text-brand-muted" />
            </div>
            <p className="text-brand-muted text-sm">Club cerrado este día</p>
          </div>
        ) : !hasAnySlots ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
              <CalendarOff className="w-5 h-5 text-brand-muted" />
            </div>
            <p className="text-brand-muted text-sm">Sin horarios disponibles</p>
          </div>
        ) : (
          courtsWithSlots.map((court) => (
            <div key={court.id}>
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">
                {court.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {court.slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() =>
                      setModalSlot({ courtId: court.id, courtName: court.name, date: selectedDate, startTime: slot })
                    }
                    className="px-3 py-1.5 rounded-xl text-sm font-medium border border-white/10 text-white bg-white/5 hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          ))
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
