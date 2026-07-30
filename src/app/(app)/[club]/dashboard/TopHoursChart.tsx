interface TopHourPoint {
  label: string;
  count: number;
}

interface TopHoursChartProps {
  points: TopHourPoint[];
}

// Horizontal bars, plain HTML/CSS — same approach as WeekdayOccupancyChart.
// Bar width is relative to the largest count in the list (not a fixed 0-100
// scale), since these are absolute reservation counts, not percentages.
export function TopHoursChart({ points }: TopHoursChartProps) {
  if (points.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center">
        <p className="text-sm text-brand-muted text-center">
          Aún no hay suficientes reservas para identificar horarios populares.
        </p>
      </div>
    );
  }

  const maxCount = Math.max(1, ...points.map((p) => p.count));

  return (
    <div className="flex flex-col gap-2.5">
      {points.map((p) => (
        <div key={p.label} className="flex items-center gap-3">
          <span className="text-xs text-brand-muted w-12 shrink-0 font-mono">{p.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(p.count / maxCount) * 100}%`,
                backgroundColor: "var(--club-primary, #00ffff)",
              }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-white shrink-0 whitespace-nowrap">
            {p.count} reserva{p.count !== 1 ? "s" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
