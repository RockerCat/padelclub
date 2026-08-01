"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { COURTS_STATUS_OPTIONS, type CourtsStatusFilter as CourtsStatusFilterKey } from "./courtsStatusFilterConfig";

// Same "plain <select> writes to a search param" pattern already used by
// the Rendimiento view's PeriodSelector — preserves every other param
// (tab=canchas included) via URLSearchParams(searchParams.toString()),
// only ever touching `status`. text-base (16px) on mobile avoids iOS
// Safari's input-zoom-on-focus for a <select>, same convention as
// PeriodSelector.
export function CourtsStatusFilter({ value }: { value: CourtsStatusFilterKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Estado"
      className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
    >
      {COURTS_STATUS_OPTIONS.map((opt) => (
        <option key={opt.key} value={opt.key} className="bg-[#001A24]">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
