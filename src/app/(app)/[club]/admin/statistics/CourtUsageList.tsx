import type { ClubStatisticsCourtUsage } from "@/lib/clubStatistics";

// Plain row list, not a table — inherently mobile-safe (no column overflow
// to manage) and already sorted by the RPC (reservedMinutes desc, then
// reservationCount desc, then name asc). Includes currently-inactive courts
// that had activity in the period — never filtered by courts.is_active.
export function CourtUsageList({ courts }: { courts: ClubStatisticsCourtUsage[] }) {
  const maxMinutes = Math.max(1, ...courts.map((c) => c.reservedMinutes));

  return (
    <div className="flex flex-col divide-y divide-white/[0.06]">
      {courts.map((c) => {
        const hours = Math.round((c.reservedMinutes / 60) * 10) / 10;
        const pct = Math.round((c.reservedMinutes / maxMinutes) * 100);
        return (
          <div key={c.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm font-medium text-white truncate min-w-0">{c.name}</span>
              <span className="text-xs text-brand-muted shrink-0 tabular-nums">
                {c.reservationCount} reserva{c.reservationCount === 1 ? "" : "s"} · {hours}h
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: "var(--club-primary, #00ffff)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
