import type { LucideIcon } from "lucide-react";
import { CalendarDays, CheckCircle2, Clock, XCircle, Timer, Percent } from "lucide-react";
import type { ClubStatisticsSummary, ClubStatisticsPreviousSummary } from "@/lib/clubStatistics";

// Comparison against the immediately preceding period of the exact same
// length (see get_club_statistics's previousSummary). previous = 0 is
// handled explicitly — never a divide-by-zero, never "Infinity%".
function formatComparison(current: number, previous: number): string | null {
  if (previous === 0) {
    if (current === 0) return "0%";
    return "Sin datos anteriores";
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return `▲ ${pct}%`;
  if (pct < 0) return `▼ ${Math.abs(pct)}%`;
  return "Sin cambio";
}

// Same visual language as the Dashboard's KpiCard (bg-brand-surface card,
// 3px top accent, faded corner icon, color-mix icon chip) — copied rather
// than imported since that component is private to dashboard/page.tsx and
// this is a distinct page, not a dashboard refactor.
function StatKpiCard({
  label,
  mobileLabel,
  value,
  unit,
  sub,
  sub2,
  comparison,
  Icon,
  color,
}: {
  label: string;
  /** Shorter label shown only below `sm` (3-col mobile grid) — the full
   *  `label` is unchanged on tablet/desktop. Defaults to `label` for cards
   *  whose text is already short enough. */
  mobileLabel?: string;
  value: string;
  unit?: string;
  sub?: string;
  /** Second, independent caption line — kept visually distinct from `sub` so
   *  two unrelated facts (e.g. a type breakdown and a derived average)
   *  never read as if one were the definition of the other. Hidden below
   *  `sm` — the 3-col mobile grid has no room for it; the value it derives
   *  from is untouched, only its visibility. */
  sub2?: string;
  comparison?: string | null;
  Icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="relative bg-brand-surface border border-white/10 rounded-2xl p-3 sm:p-5 xl:p-4 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color, opacity: 0.8 }} />
      <Icon className="hidden sm:block absolute right-4 bottom-4 w-14 h-14 xl:w-10 xl:h-10 text-white opacity-[0.04]" />
      <div
        className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-4 xl:mb-3"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </div>
      <p className="text-[10px] sm:text-xs text-brand-muted mb-0.5 sm:mb-1 leading-tight line-clamp-2">
        <span className="sm:hidden">{mobileLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </p>
      <p className="leading-none mb-1" style={{ color }}>
        <span className="text-xl sm:text-3xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-sm sm:text-xl font-semibold ml-0.5">{unit}</span>}
      </p>
      {sub && <p className="hidden sm:block text-[11px] text-brand-muted/70">{sub}</p>}
      {sub2 && <p className="hidden sm:block text-[11px] text-brand-muted/70">{sub2}</p>}
      {comparison && (
        <p className="text-[9px] sm:text-[11px] text-brand-muted/70 mt-0.5 sm:mt-1 truncate">
          {comparison}
          <span className="hidden sm:inline"> vs. periodo anterior</span>
        </p>
      )}
    </div>
  );
}

export function StatsKpiGrid({
  summary,
  previousSummary,
}: {
  summary: ClubStatisticsSummary;
  previousSummary: ClubStatisticsPreviousSummary;
}) {
  const previousConfirmationRate =
    previousSummary.totalReservations === 0
      ? 0
      : Math.round((previousSummary.confirmed / previousSummary.totalReservations) * 1000) / 10;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <StatKpiCard
        label="Reservas del periodo (todos los estados)"
        mobileLabel="Reservas"
        value={String(summary.totalReservations)}
        sub={`${summary.matchReservations} partidos · ${summary.classReservations} clases`}
        sub2={`Promedio diario: ${summary.dailyAverage}`}
        comparison={formatComparison(summary.totalReservations, previousSummary.totalReservations)}
        Icon={CalendarDays}
        color="var(--club-primary, #00ffff)"
      />
      <StatKpiCard
        label="Confirmadas"
        value={String(summary.confirmed)}
        comparison={formatComparison(summary.confirmed, previousSummary.confirmed)}
        Icon={CheckCircle2}
        color="#22C55E"
      />
      <StatKpiCard
        label="Pendientes"
        value={String(summary.pending)}
        comparison={formatComparison(summary.pending, previousSummary.pending)}
        Icon={Clock}
        color="#EAB308"
      />
      <StatKpiCard
        label="Canceladas o rechazadas"
        mobileLabel="Canceladas"
        value={String(summary.cancelledOrRejected)}
        comparison={formatComparison(summary.cancelledOrRejected, previousSummary.cancelledOrRejected)}
        Icon={XCircle}
        color="#EF4444"
      />
      <StatKpiCard
        label="Horas reservadas"
        value={String(summary.reservedHours)}
        unit="h"
        comparison={formatComparison(summary.reservedMinutes, previousSummary.reservedMinutes)}
        Icon={Timer}
        color="var(--club-primary, #00ffff)"
      />
      {/* Neutral, not magnitude-colored — a low/high confirmation rate is
          not automatically bad/good on its own (could reflect a slow
          season, a new club, etc.), so this never becomes a red/green
          traffic light; see the Dashboard's semantic color rule. */}
      <StatKpiCard
        label="Tasa de confirmación"
        value={String(summary.confirmationRate)}
        unit="%"
        sub="Confirmadas sobre el total de reservas del periodo (todos los estados)"
        comparison={formatComparison(summary.confirmationRate, previousConfirmationRate)}
        Icon={Percent}
        color="var(--club-primary, #00ffff)"
      />
    </div>
  );
}
