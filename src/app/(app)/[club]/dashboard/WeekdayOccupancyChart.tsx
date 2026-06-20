interface WeekdayPoint {
  label: string;
  pct: number;
}

interface WeekdayOccupancyChartProps {
  points: WeekdayPoint[];
}

function colorForPct(pct: number): string {
  return pct >= 70 ? "#22C55E" : pct >= 40 ? "#EAB308" : "#EF4444";
}

// Horizontal bars, plain HTML/CSS — no SVG, so there's no scaling/distortion
// concern. Caller is expected to pass points already sorted (highest first).
export function WeekdayOccupancyChart({ points }: WeekdayOccupancyChartProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {points.map((p) => {
        const color = colorForPct(p.pct);
        return (
          <div key={p.label} className="flex items-center gap-3">
            <span className="text-xs text-brand-muted w-8 shrink-0">{p.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${p.pct}%`, backgroundColor: color }}
              />
            </div>
            <span
              className="text-xs font-semibold tabular-nums w-9 text-right shrink-0"
              style={{ color }}
            >
              {p.pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
