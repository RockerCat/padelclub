import type { ClubStatisticsHourlyPoint } from "@/lib/clubStatistics";

// Vertical bars, one per observed hour (only the min..max range found in
// the data — never all 24h). "Reservas que comienzan en esta franja", not
// occupancy — a reservation starting at 18:30 already landed in the 18:00
// bucket server-side (get_club_statistics), never split across two.
export function HourlySlotsChart({ hourlySlots }: { hourlySlots: ClubStatisticsHourlyPoint[] }) {
  const maxValue = Math.max(1, ...hourlySlots.map((h) => h.count));

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 h-[140px] min-w-max px-1">
        {hourlySlots.map((h) => {
          // Same rule as TimelineChart: a genuine 0 must render at exactly
          // zero height, never the "still visible" 2% floor.
          const heightPct = h.count === 0 ? 0 : Math.max(2, Math.round((h.count / maxValue) * 100));
          return (
            <div
              key={h.hour}
              className="flex flex-col items-center justify-end h-full w-7 shrink-0"
              title={`${h.label}: ${h.count} reserva${h.count === 1 ? "" : "s"}`}
            >
              <span className="text-[10px] text-brand-muted tabular-nums mb-1 leading-none">{h.count}</span>
              <div
                className="w-full rounded-t-md"
                style={{ height: `${heightPct}%`, backgroundColor: "var(--club-secondary, #1698BE)", opacity: 0.85 }}
              />
              <span className="text-[9px] text-brand-muted/70 mt-1.5 leading-none whitespace-nowrap">
                {h.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
