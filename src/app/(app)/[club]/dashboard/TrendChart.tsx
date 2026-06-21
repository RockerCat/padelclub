interface TrendPoint {
  label: string;
  value: number;
  /** Stable identifier (e.g. bucket start date) — falls back to index if omitted. */
  id?: string;
}

interface TrendChartProps {
  points: TrendPoint[];
}

const WIDTH = 600;
const HEIGHT = 140;
const PAD_X = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 22;
const CHART_W = WIDTH - PAD_X * 2;
const CHART_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

// Single clean line + discrete points — no gridlines, no animations, no legends.
// Y-axis scales to the max value in the dataset (not a fixed 0-100), so it
// works for any absolute metric (reservation counts, etc).
//
// The <svg> uses preserveAspectRatio="none" so the line stretches to fill the
// card's full width while keeping a fixed height. That non-uniform scaling is
// fine for the connecting <path>, but anything meant to keep a fixed, regular
// shape — text glyphs, the point markers — would get stretched along with it.
// So labels AND the point markers are rendered as plain HTML on top (%/px
// positioned), outside the scaled SVG coordinate system.
export function TrendChart({ points }: TrendChartProps) {
  const maxValue = Math.max(1, ...points.map((p) => p.value));

  const coords = points.map((p, i) => {
    const x = points.length > 1 ? PAD_X + (CHART_W / (points.length - 1)) * i : WIDTH / 2;
    const y = PAD_TOP + CHART_H - (p.value / maxValue) * CHART_H;
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <div className="relative w-full h-[140px]">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        <path d={linePath} fill="none" stroke="var(--club-primary, #B7E000)" strokeWidth="2" />
      </svg>

      {coords.map((c, i) => (
        <span
          key={`dot-${c.id ?? i}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full"
          style={{
            left: `${(c.x / WIDTH) * 100}%`,
            top: `${c.y}px`,
            backgroundColor: "var(--club-primary, #B7E000)",
          }}
        />
      ))}

      {coords.map((c, i) => (
        <span
          key={`value-${c.id ?? i}`}
          className="absolute -translate-x-1/2 text-[10px] leading-none text-[#94A3B8] whitespace-nowrap"
          style={{ left: `${(c.x / WIDTH) * 100}%`, top: `${c.y - 16}px` }}
        >
          {c.value}
        </span>
      ))}
      {coords.map((c, i) => (
        <span
          key={`label-${c.id ?? i}`}
          className="absolute -translate-x-1/2 text-[10px] leading-none text-[#64748B] whitespace-nowrap"
          style={{ left: `${(c.x / WIDTH) * 100}%`, top: `${HEIGHT - PAD_BOTTOM + 4}px` }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}
