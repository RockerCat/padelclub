import type { ProfileActivityTypePoint } from "@/lib/profileActivity";

// Same horizontal-bar-via-CSS pattern as the club Statistics page's
// StatusDistributionChart. Only 'match'/'class' exist as non-block types
// in this schema — never an invented third category.
export function TypeDistributionChart({ points }: { points: ProfileActivityTypePoint[] }) {
  const maxValue = Math.max(1, ...points.map((p) => p.count));

  return (
    <div className="flex flex-col gap-2.5">
      {points.map((p) => {
        const pct = Math.round((p.count / maxValue) * 100);
        return (
          <div key={p.type} className="flex items-center gap-3">
            <span className="text-xs text-brand-muted w-16 shrink-0">{p.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: "var(--club-primary, #B7E000)" }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums w-8 text-right shrink-0 text-white">{p.count}</span>
          </div>
        );
      })}
    </div>
  );
}
