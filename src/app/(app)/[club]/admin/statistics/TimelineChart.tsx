import type { ClubStatisticsTimelinePoint } from "@/lib/clubStatistics";

const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function formatDayLabel(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function formatWeekLabel(iso: string): string {
  const start = parseISO(iso);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getDate()} ${MONTH[start.getMonth()]} – ${end.getDate()} ${MONTH[end.getMonth()]}`;
}

// Vertical bars (never a line) — a zero-value day/week must read unambiguously
// as zero, which a line dropping to the baseline can visually blur into
// "missing data". Horizontally scrollable with a fixed per-bar min-width so
// labels never overlap regardless of point count (7 daily up to ~13 weekly
// points for 90 days) — same "overflow interno controlado" convention
// WeekCalendar's own grid already uses for the same reason.
export function TimelineChart({
  points,
  granularity,
}: {
  points: ClubStatisticsTimelinePoint[];
  granularity: "day" | "week";
}) {
  const maxValue = Math.max(1, ...points.map((p) => p.count));
  const formatLabel = granularity === "day" ? formatDayLabel : formatWeekLabel;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 h-[160px] min-w-max px-1">
        {points.map((p) => {
          // A count of exactly 0 must render as exactly zero height — the
          // 2% floor below is only a "still visible" minimum for genuinely
          // positive counts that would otherwise round to an invisible bar.
          const heightPct = p.count === 0 ? 0 : Math.max(2, Math.round((p.count / maxValue) * 100));
          const tooltip =
            granularity === "day"
              ? `${formatDayLabel(p.date)}: ${p.count} reserva${p.count === 1 ? "" : "s"}`
              : `Semana del ${formatWeekLabel(p.date)}: ${p.count} reserva${p.count === 1 ? "" : "s"}`;
          return (
            <div
              key={p.date}
              className="flex flex-col items-center justify-end h-full w-6 shrink-0"
              title={tooltip}
            >
              <span className="text-[10px] text-brand-muted tabular-nums mb-1 leading-none">{p.count}</span>
              <div
                className="w-full rounded-t-md"
                style={{ height: `${heightPct}%`, backgroundColor: "var(--club-primary, #00ffff)", opacity: 0.85 }}
              />
              <span className="text-[9px] text-brand-muted/70 mt-1.5 leading-none whitespace-nowrap rotate-0">
                {formatLabel(p.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
