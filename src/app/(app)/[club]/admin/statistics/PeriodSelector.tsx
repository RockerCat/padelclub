"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { STATS_PERIOD_OPTIONS, type StatsPeriodKey } from "@/lib/clubStatisticsRange";

// Same "plain <select> writes to a search param" pattern as the Dashboard's
// DateRangeSelector — best for exactly 5 fixed options, native and
// mobile-friendly with no extra chrome.
export function PeriodSelector({ value }: { value: StatsPeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Periodo"
      className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
    >
      {STATS_PERIOD_OPTIONS.map((opt) => (
        <option key={opt.key} value={opt.key} className="bg-[#001A24]">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
