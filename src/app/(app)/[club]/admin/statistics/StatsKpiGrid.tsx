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
  value,
  unit,
  sub,
  sub2,
  comparison,
  Icon,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  /** Second, independent caption line — kept visually distinct from `sub` so
   *  two unrelated facts (e.g. a type breakdown and a derived average)
   *  never read as if one were the definition of the other. */
  sub2?: string;
  comparison?: string | null;
  Icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="relative bg-brand-surface border border-white/10 rounded-2xl p-5 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color, opacity: 0.8 }} />
      <Icon className="absolute right-4 bottom-4 w-14 h-14 text-white opacity-[0.04]" />
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs text-brand-muted mb-1 leading-tight">{label}</p>
      <p className="leading-none mb-1" style={{ color }}>
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xl font-semibold ml-0.5">{unit}</span>}
      </p>
      {sub && <p className="text-[11px] text-brand-muted/70">{sub}</p>}
      {sub2 && <p className="text-[11px] text-brand-muted/70">{sub2}</p>}
      {comparison && <p className="text-[11px] text-brand-muted/70 mt-1">{comparison} vs. periodo anterior</p>}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <StatKpiCard
        label="Reservas del periodo (todos los estados)"
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
        color="var(--club-secondary, #037172)"
      />
      <StatKpiCard
        label="Tasa de confirmación"
        value={String(summary.confirmationRate)}
        unit="%"
        sub="Confirmadas sobre el total de reservas del periodo (todos los estados)"
        comparison={formatComparison(summary.confirmationRate, previousConfirmationRate)}
        Icon={Percent}
        color="#8B5CF6"
      />
    </div>
  );
}
