import type { ProfileActivityMonthPoint } from "@/lib/profileActivity";

const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH[m - 1]} ${String(y).slice(2)}`;
}

// Same vertical-bar-via-CSS pattern as the club Statistics page's
// TimelineChart — zero must render at exactly zero height, never a "still
// visible" floor. Fixed 12-point window (get_my_profile_activity), always
// zero-filled, never a silent gap.
export function MonthlyActivityChart({ points }: { points: ProfileActivityMonthPoint[] }) {
  const maxValue = Math.max(1, ...points.map((p) => p.count));

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 h-[140px] min-w-max px-1">
        {points.map((p) => {
          const heightPct = p.count === 0 ? 0 : Math.max(2, Math.round((p.count / maxValue) * 100));
          return (
            <div
              key={p.month}
              className="flex flex-col items-center justify-end h-full w-8 shrink-0"
              title={`${formatMonthLabel(p.month)}: ${p.count} reserva${p.count === 1 ? "" : "s"}`}
            >
              <span className="text-[10px] text-brand-muted tabular-nums mb-1 leading-none">{p.count}</span>
              <div
                className="w-full rounded-t-md"
                style={{ height: `${heightPct}%`, backgroundColor: "var(--club-primary, #00ffff)", opacity: 0.85 }}
              />
              <span className="text-[9px] text-brand-muted/70 mt-1.5 leading-none whitespace-nowrap">
                {formatMonthLabel(p.month)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
