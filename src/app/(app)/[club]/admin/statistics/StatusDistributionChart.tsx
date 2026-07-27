import type { ClubStatisticsStatusPoint } from "@/lib/clubStatistics";

// Fixed, semantic colors — same convention already used for reservation
// status elsewhere in the app (confirmed/green, pending/amber) — never the
// club's own configured brand color, which is reserved for identity
// surfaces only (see CLAUDE.md → Club Identity Principles). Cancelled and
// rejected get distinct shades since this view deliberately keeps them
// separate (unlike the single "Canceladas o rechazadas" KPI).
const STATUS_COLOR: Record<ClubStatisticsStatusPoint["status"], string> = {
  confirmed: "#22C55E",
  pending: "#EAB308",
  cancelled: "#EF4444",
  rejected: "#F97316",
};

// Horizontal bars scaled to the largest count in this dataset (never a
// fixed 0-100 — these are counts, not percentages, and percentages that
// round to sum incorrectly are exactly what the spec rules out).
export function StatusDistributionChart({ statuses }: { statuses: ClubStatisticsStatusPoint[] }) {
  const maxValue = Math.max(1, ...statuses.map((s) => s.count));

  return (
    <div className="flex flex-col gap-2.5">
      {statuses.map((s) => {
        const color = STATUS_COLOR[s.status];
        const pct = Math.round((s.count / maxValue) * 100);
        return (
          <div key={s.status} className="flex items-center gap-3">
            <span className="text-xs text-brand-muted w-24 shrink-0">{s.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-xs font-semibold tabular-nums w-8 text-right shrink-0" style={{ color }}>
              {s.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
