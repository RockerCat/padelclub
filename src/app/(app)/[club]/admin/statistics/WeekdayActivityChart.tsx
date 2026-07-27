import type { ClubStatisticsWeekdayPoint } from "@/lib/clubStatistics";

const SHORT_LABEL: Record<number, string> = {
  1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom",
};

// Fixed calendar order (Monday..Sunday, never reordered by volume) —
// scaled to the largest count in this dataset. Reserved hours shown as a
// small secondary line under the count, never a second bar/series, so the
// chart stays legible on mobile.
export function WeekdayActivityChart({ weekdays }: { weekdays: ClubStatisticsWeekdayPoint[] }) {
  const maxValue = Math.max(1, ...weekdays.map((w) => w.count));

  return (
    <div className="flex flex-col gap-2.5">
      {weekdays.map((w) => {
        const pct = Math.round((w.count / maxValue) * 100);
        const hours = Math.round((w.reservedMinutes / 60) * 10) / 10;
        return (
          <div key={w.weekday} className="flex items-center gap-3">
            <span className="text-xs text-brand-muted w-9 shrink-0">{SHORT_LABEL[w.weekday]}</span>
            <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: "var(--club-primary, #B7E000)" }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums w-8 text-right shrink-0 text-white">
              {w.count}
            </span>
            <span className="text-[10px] text-brand-muted/70 w-12 text-right shrink-0 hidden sm:inline">
              {hours}h
            </span>
          </div>
        );
      })}
    </div>
  );
}
