"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";

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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};

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

// ─── ReservationBlock (desktop column card) ───────────────────────────────────

function ReservationBlock({
  r,
  color,
  clubSlug,
}: {
  r: CalendarReservation;
  color: CourtColor;
  clubSlug: string;
}) {
  // Truncate players to keep block compact
  const playerSummary =
    r.players.length === 0
      ? null
      : r.players.length <= 2
      ? r.players.join(", ")
      : `${r.players[0]}, +${r.players.length - 1}`;

  return (
    <Link
      href={`/${clubSlug}/admin/reservations/${r.id}`}
      style={{ backgroundColor: color.bg, borderLeftColor: color.accent }}
      className="block rounded-lg px-2.5 py-2 border-l-[3px] hover:brightness-125 active:brightness-90 transition-all cursor-pointer"
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
  );
}

// ─── DayColumn (desktop) ──────────────────────────────────────────────────────

function DayColumn({
  day,
  reservations,
  courtColorMap,
  isToday,
  clubSlug,
}: {
  day: WeekDay;
  reservations: CalendarReservation[];
  courtColorMap: Map<string, CourtColor>;
  isToday: boolean;
  clubSlug: string;
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
}: {
  day: WeekDay;
  reservations: CalendarReservation[];
  courtColorMap: Map<string, CourtColor>;
  clubSlug: string;
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
            return (
              <Link
                key={r.id}
                href={`/${clubSlug}/admin/reservations/${r.id}`}
                style={{ backgroundColor: color.bg, borderLeftColor: color.accent }}
                className="block rounded-xl p-4 border-l-[3px]"
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
}: WeekCalendarProps) {
  // Mobile: track selected day (default = today if in this week, else Mon)
  const todayIdx = weekDays.findIndex((d) => d.date === todayStr);
  const [selectedDayIdx, setSelectedDayIdx] = useState(todayIdx >= 0 ? todayIdx : 0);

  // Build court color map
  const courtColorMap = new Map<string, CourtColor>();
  courts.forEach((c) => {
    courtColorMap.set(c.id, COURT_PALETTE[c.colorIndex % COURT_PALETTE.length]);
  });

  const byDate = groupByDate(reservations);
  const totalCount = reservations.length;

  return (
    <div>
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
        />
      </div>
    </div>
  );
}
