interface WeekdayPoint {
  label: string;
  pct: number;
  /** Club is closed this day — render a muted "Cerrado" pill instead of a 0% bar. */
  closed?: boolean;
  /** Stable identifier (ISO date for a specific day, weekday number for an aggregate) — falls back to label if omitted. */
  id?: string;
}

interface WeekdayOccupancyChartProps {
  points: WeekdayPoint[];
}

function colorForPct(pct: number): string {
  return pct >= 70 ? "#22C55E" : pct >= 40 ? "#EAB308" : "#EF4444";
}

// Horizontal bars, plain HTML/CSS — no SVG, so there's no scaling/distortion
// concern. Caller controls point order (historical view sorts highest-first;
// a 7-day heatmap view passes them in calendar order instead).
export function WeekdayOccupancyChart({ points }: WeekdayOccupancyChartProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {points.map((p) => {
        const color = colorForPct(p.pct);
        return (
          <div key={p.id ?? p.label} className="flex items-center gap-3">
            <span className="text-xs text-brand-muted w-8 shrink-0">{p.label}</span>
            {p.closed ? (
              <span className="text-[11px] text-brand-muted/50">Cerrado</span>
            ) : (
              <>
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
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
