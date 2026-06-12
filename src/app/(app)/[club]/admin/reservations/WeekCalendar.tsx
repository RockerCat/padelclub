"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  MoreVertical,
  Pencil,
  XCircle,
  Check,
  X,
} from "lucide-react";
import { cancelReservation } from "./actions";

// ─── Court color palette (dark-theme safe) ────────────────────────────────────

const COURT_PALETTE = [
  { accent: "#B7E000", bg: "rgba(183,224,0,0.10)", border: "rgba(183,224,0,0.25)" },
  { accent: "#1698BE", bg: "rgba(22,152,190,0.10)", border: "rgba(22,152,190,0.25)" },
  { accent: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.25)" },
  { accent: "#FB923C", bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.25)" },
  { accent: "#A78BFA", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.25)" },
  { accent: "#34D399", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.25)" },
];

type CourtColor = (typeof COURT_PALETTE)[0];

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeekDay = {
  date: string;      // YYYY-MM-DD
  dayName: string;   // "lun", "mar" …
  dayNum: number;
  monthName: string; // "jun", "jul" …
};

export type CalendarReservation = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  title: string | null;
  court_id: string;
  courtName: string;
  players: string[];
};

export type CalendarCourt = {
  id: string;
  name: string;
  colorIndex: number;
};

interface WeekCalendarProps {
  weekDays: WeekDay[];
  weekLabel: string;
  reservations: CalendarReservation[];
  courts: CalendarCourt[];
  prevWeekHref: string;
  nextWeekHref: string;
  todayStr: string;
  clubSlug: string;
  clubId: string;
  successMessage?: string; // "updated" | "cancelled"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};

const MODAL_MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MODAL_DAYS   = ["dom","lun","mar","mié","jue","vie","sáb"];

function fmt(t: string) {
  return t.slice(0, 5);
}

function endTime(start: string, mins: number) {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function groupByDate(reservations: CalendarReservation[]) {
  return reservations.reduce<Record<string, CalendarReservation[]>>((acc, r) => {
    (acc[r.date] ??= []).push(r);
    return acc;
  }, {});
}

function formatModalDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${MODAL_DAYS[dt.getDay()]} ${dt.getDate()} ${MODAL_MONTHS[dt.getMonth()]}`;
}

// ─── ActionMenu (⋮ dropdown shared by desktop + mobile cards) ─────────────────

function ActionMenu({
  editHref,
  onCancel,
  size = "sm",
}: {
  editHref: string;
  onCancel: () => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const btnCls =
    size === "md"
      ? "w-7 h-7 flex items-center justify-center rounded-lg text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
      : "w-5 h-5 flex items-center justify-center rounded text-brand-muted/60 hover:text-white hover:bg-white/10 transition-colors";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={btnCls}
        aria-label="Opciones"
      >
        <MoreVertical className={size === "md" ? "w-4 h-4" : "w-3 h-3"} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-0.5 bg-[#0e3347] border border-white/20 rounded-xl shadow-xl overflow-hidden min-w-[104px] z-[200]">
          <Link
            href={editHref}
            className="flex items-center gap-2 px-3 py-2.5 text-xs text-white hover:bg-white/5 transition-colors"
            onClick={() => setOpen(false)}
          >
            <Pencil className="w-3 h-3 shrink-0" />
            Editar
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCancel();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/[0.06]"
          >
            <XCircle className="w-3 h-3 shrink-0" />
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ReservationBlock (desktop column card) ───────────────────────────────────

function ReservationBlock({
  r,
  color,
  clubSlug,
  onCancelClick,
}: {
  r: CalendarReservation;
  color: CourtColor;
  clubSlug: string;
  onCancelClick: () => void;
}) {
  const playerSummary =
    r.players.length === 0
      ? null
      : r.players.length <= 2
      ? r.players.join(", ")
      : `${r.players[0]}, +${r.players.length - 1}`;

  const editHref = `/${clubSlug}/admin/reservations/${r.id}`;

  return (
    <div className="relative">
      <Link
        href={editHref}
        style={{ backgroundColor: color.bg, borderLeftColor: color.accent }}
        className="block rounded-lg px-2.5 py-2 pr-7 border-l-[3px] hover:brightness-125 active:brightness-90 transition-all cursor-pointer"
      >
        <p className="text-[11px] font-bold leading-tight mb-0.5" style={{ color: color.accent }}>
          {fmt(r.start_time)}–{endTime(r.start_time, r.duration_minutes)}
        </p>
        <p className="text-[11px] font-medium text-white leading-tight truncate">
          {r.courtName}
        </p>
        <p className="text-[10px] text-brand-muted leading-tight truncate">
          {TYPE_LABELS[r.type] ?? r.type}
          {r.title ? ` · ${r.title}` : ""}
        </p>
        {playerSummary && (
          <p className="text-[10px] text-brand-muted/60 leading-tight truncate mt-0.5">
            {playerSummary}
          </p>
        )}
      </Link>

      <div className="absolute top-1 right-1 z-10">
        <ActionMenu editHref={editHref} onCancel={onCancelClick} size="sm" />
      </div>
    </div>
  );
}

// ─── DayColumn (desktop) ──────────────────────────────────────────────────────

function DayColumn({
  day,
  reservations,
  courtColorMap,
  isToday,
  clubSlug,
  onCancelClick,
}: {
  day: WeekDay;
  reservations: CalendarReservation[];
  courtColorMap: Map<string, CourtColor>;
  isToday: boolean;
  clubSlug: string;
  onCancelClick: (r: CalendarReservation) => void;
}) {
  const sorted = [...reservations].sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );

  return (
    <div className="flex flex-col">
      {/* Day header */}
      <div
        className={`rounded-xl text-center py-2.5 px-1 mb-2 ${
          isToday ? "bg-brand-primary/10" : "bg-white/[0.03]"
        }`}
      >
        <p
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            isToday ? "text-brand-primary" : "text-brand-muted"
          }`}
        >
          {day.dayName}
        </p>
        <p
          className={`text-xl font-bold leading-snug ${
            isToday ? "text-brand-primary" : "text-white"
          }`}
        >
          {day.dayNum}
        </p>
        <p
          className={`text-[10px] ${
            isToday ? "text-brand-primary/60" : "text-brand-muted/50"
          }`}
        >
          {day.monthName}
        </p>
      </div>

      {/* Reservation cards */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-[80px]">
        {sorted.map((r) => (
          <ReservationBlock
            key={r.id}
            r={r}
            color={courtColorMap.get(r.court_id) ?? COURT_PALETTE[0]}
            clubSlug={clubSlug}
            onCancelClick={() => onCancelClick(r)}
          />
        ))}
      </div>

      {/* Quick-create button */}
      <Link
        href={`/${clubSlug}/admin/reservations/new?date=${day.date}`}
        className="mt-2 flex items-center justify-center gap-1 h-7 rounded-lg border border-dashed border-white/10 text-[10px] font-medium text-brand-muted/40 hover:text-brand-muted hover:border-white/25 transition-colors"
      >
        <Plus className="w-3 h-3" />
        Reserva
      </Link>
    </div>
  );
}

// ─── MobileDayList ────────────────────────────────────────────────────────────

function MobileDayList({
  day,
  reservations,
  courtColorMap,
  clubSlug,
  onCancelClick,
}: {
  day: WeekDay;
  reservations: CalendarReservation[];
  courtColorMap: Map<string, CourtColor>;
  clubSlug: string;
  onCancelClick: (r: CalendarReservation) => void;
}) {
  const sorted = [...reservations].sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white capitalize">
          {day.dayName} {day.dayNum} {day.monthName}
        </h2>
        <Link
          href={`/${clubSlug}/admin/reservations/new?date=${day.date}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/20 text-xs font-medium text-white hover:border-white/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Reserva
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-brand-muted">Sin reservas este día</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((r) => {
            const color = courtColorMap.get(r.court_id) ?? COURT_PALETTE[0];
            const editHref = `/${clubSlug}/admin/reservations/${r.id}`;
            return (
              <div key={r.id} className="relative">
                <Link
                  href={editHref}
                  style={{ backgroundColor: color.bg, borderLeftColor: color.accent }}
                  className="block rounded-xl p-4 pr-12 border-l-[3px]"
                >
                  <p className="text-sm font-bold mb-1" style={{ color: color.accent }}>
                    {fmt(r.start_time)} – {endTime(r.start_time, r.duration_minutes)}
                    <span className="text-xs font-normal text-brand-muted ml-2">
                      {r.duration_minutes} min
                    </span>
                  </p>
                  <p className="text-sm font-semibold text-white">{r.courtName}</p>
                  <p className="text-xs text-brand-muted mt-0.5">
                    {TYPE_LABELS[r.type] ?? r.type}
                    {r.title ? ` · ${r.title}` : ""}
                  </p>
                  {r.players.length > 0 && (
                    <p className="text-xs text-brand-muted/70 mt-1 truncate">
                      {r.players.join(", ")}
                    </p>
                  )}
                </Link>

                <div className="absolute top-3 right-3 z-10">
                  <ActionMenu
                    editHref={editHref}
                    onCancel={() => onCancelClick(r)}
                    size="md"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── WeekCalendar ─────────────────────────────────────────────────────────────

export function WeekCalendar({
  weekDays,
  weekLabel,
  reservations,
  courts,
  prevWeekHref,
  nextWeekHref,
  todayStr,
  clubSlug,
  clubId,
  successMessage,
}: WeekCalendarProps) {
  const router = useRouter();

  // Mobile: track selected day (default = today if in this week, else Mon)
  const todayIdx = weekDays.findIndex((d) => d.date === todayStr);
  const [selectedDayIdx, setSelectedDayIdx] = useState(todayIdx >= 0 ? todayIdx : 0);

  // Success banner
  const [showBanner, setShowBanner] = useState(!!successMessage);

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<CalendarReservation | null>(null);
  const [cancelPending, startCancelTransition] = useTransition();

  // Auto-dismiss banner + clean URL
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setShowBanner(false), 4000);
    const url = new URL(window.location.href);
    url.searchParams.delete("updated");
    url.searchParams.delete("cancelled");
    const clean = url.pathname + (url.searchParams.size > 0 ? `?${url.searchParams}` : "");
    router.replace(clean, { scroll: false });
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build court color map
  const courtColorMap = new Map<string, CourtColor>();
  courts.forEach((c) => {
    courtColorMap.set(c.id, COURT_PALETTE[c.colorIndex % COURT_PALETTE.length]);
  });

  const byDate = groupByDate(reservations);
  const totalCount = reservations.length;

  function handleCancelClick(r: CalendarReservation) {
    setCancelTarget(r);
  }

  function handleConfirmCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    startCancelTransition(async () => {
      await cancelReservation(clubId, clubSlug, target.id);
    });
  }

  return (
    <div>
      {/* ─── Success banner ──────────────────────────────────────────────── */}
      {showBanner && successMessage && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-400">
          <Check className="w-4 h-4 shrink-0" />
          <span>
            {successMessage === "updated"
              ? "Reserva actualizada correctamente."
              : "Reserva cancelada correctamente."}
          </span>
          <button
            type="button"
            onClick={() => setShowBanner(false)}
            className="ml-auto text-green-400/50 hover:text-green-400 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        {/* Week navigation */}
        <div className="flex items-center gap-1">
          <Link
            href={prevWeekHref}
            className="h-8 w-8 rounded-lg border border-white/15 flex items-center justify-center text-brand-muted hover:text-white hover:border-white/30 transition-colors"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="px-3 text-sm font-semibold text-white min-w-[148px] text-center">
            {weekLabel}
          </span>
          <Link
            href={nextWeekHref}
            className="h-8 w-8 rounded-lg border border-white/15 flex items-center justify-center text-brand-muted hover:text-white hover:border-white/30 transition-colors"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href={`/${clubSlug}/admin/reservations`}
            className="ml-1 h-8 px-3 rounded-lg border border-white/15 text-xs font-medium text-brand-muted hover:text-white hover:border-white/30 transition-colors flex items-center"
          >
            Hoy
          </Link>
        </div>

        {/* Nueva reserva */}
        <Link
          href={`/${clubSlug}/admin/reservations/new`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" />
          Nueva reserva
        </Link>
      </div>

      {/* ─── Court legend ────────────────────────────────────────────────── */}
      {courts.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-5">
          {courts.map((c) => {
            const color = COURT_PALETTE[c.colorIndex % COURT_PALETTE.length];
            return (
              <div key={c.id} className="flex items-center gap-1.5 text-xs text-brand-muted">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color.accent }}
                />
                {c.name}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── DESKTOP: 7-column grid ──────────────────────────────────────── */}
      <div className="hidden md:block">
        {totalCount === 0 && (
          <div className="mb-4 flex items-center justify-center gap-3 py-3 rounded-xl border border-dashed border-white/10 text-sm text-brand-muted">
            <CalendarDays className="w-4 h-4 shrink-0" />
            No hay reservas esta semana —{" "}
            <Link
              href={`/${clubSlug}/admin/reservations/new`}
              className="text-brand-primary hover:underline font-medium"
            >
              Crear primera reserva
            </Link>
          </div>
        )}
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[700px]">
            {weekDays.map((day) => (
              <DayColumn
                key={day.date}
                day={day}
                reservations={byDate[day.date] ?? []}
                courtColorMap={courtColorMap}
                isToday={day.date === todayStr}
                clubSlug={clubSlug}
                onCancelClick={handleCancelClick}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ─── MOBILE: day selector + list ─────────────────────────────────── */}
      <div className="md:hidden">
        {/* Horizontal day tabs */}
        <div
          className="flex gap-1.5 mb-5 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {weekDays.map((day, idx) => {
            const isSelected = idx === selectedDayIdx;
            const isToday = day.date === todayStr;
            const hasReservations = (byDate[day.date]?.length ?? 0) > 0;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDayIdx(idx)}
                className={`flex flex-col items-center shrink-0 w-12 py-2 rounded-xl border transition-colors ${
                  isSelected
                    ? "bg-brand-primary/12 border-brand-primary/30"
                    : "border-transparent hover:border-white/10"
                }`}
              >
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${
                    isSelected
                      ? "text-brand-primary"
                      : isToday
                      ? "text-brand-primary/60"
                      : "text-brand-muted"
                  }`}
                >
                  {day.dayName}
                </span>
                <span
                  className={`text-lg font-bold leading-tight ${
                    isSelected ? "text-brand-primary" : isToday ? "text-white" : "text-brand-muted"
                  }`}
                >
                  {day.dayNum}
                </span>
                {/* Dot indicator */}
                <span
                  className="w-1.5 h-1.5 rounded-full mt-0.5"
                  style={{
                    backgroundColor: hasReservations
                      ? isSelected
                        ? "var(--club-primary, #B7E000)"
                        : "rgba(148,163,184,0.5)"
                      : "transparent",
                  }}
                />
              </button>
            );
          })}
        </div>

        <MobileDayList
          day={weekDays[selectedDayIdx]}
          reservations={byDate[weekDays[selectedDayIdx]?.date ?? ""] ?? []}
          courtColorMap={courtColorMap}
          clubSlug={clubSlug}
          onCancelClick={handleCancelClick}
        />
      </div>

      {/* ─── Cancel confirmation modal ───────────────────────────────────── */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
        >
          <div className="bg-[#082735] border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-bold text-white mb-1">¿Cancelar esta reserva?</h2>
            <p className="text-sm font-medium text-brand-muted mb-0.5">
              {cancelTarget.courtName}
              {" · "}
              {formatModalDate(cancelTarget.date)}
              {" · "}
              {fmt(cancelTarget.start_time)}
            </p>
            <p className="text-xs text-brand-muted/60 mb-6">
              Esta acción liberará el horario de la cancha.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={cancelPending}
                className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-brand-muted hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelPending}
                className="flex-1 h-10 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors disabled:opacity-40"
              >
                {cancelPending ? "Cancelando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
