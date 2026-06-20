"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DASHBOARD_RANGE_PRESETS, type DashboardRangeKey } from "@/lib/dashboardRange";

interface DateRangeSelectorProps {
  value: DashboardRangeKey;
  customFrom?: string;
  customTo?: string;
  dateRangeLabel: string;
}

const dateInputClass =
  "h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white transition-colors focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary/50";

export function DateRangeSelector({ value, customFrom, customTo, dateRangeLabel }: DateRangeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Whether the custom-range picker is open. Selecting "Rango personalizado"
  // only reveals this — it doesn't navigate until "Aplicar" is clicked.
  const [showCustomPicker, setShowCustomPicker] = useState(value === "custom");
  const [from, setFrom] = useState(customFrom ?? "");
  const [to, setTo] = useState(customTo ?? "");

  const hasBothDates = !!from && !!to;
  const isInvalidRange = hasBothDates && to < from;
  const canApply = hasBothDates && !isInvalidRange;

  function navigateToPreset(nextKey: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", nextKey);
    params.delete("from");
    params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSelectChange(next: string) {
    if (next === "custom") {
      setShowCustomPicker(true);
      return;
    }
    setShowCustomPicker(false);
    navigateToPreset(next);
  }

  function handleApply() {
    if (!canApply) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 flex-nowrap">
        <select
          value={showCustomPicker ? "custom" : value}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white transition-colors focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
        >
          {DASHBOARD_RANGE_PRESETS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#001A24]">
              {opt.label}
            </option>
          ))}
          <option value="custom" className="bg-[#001A24]">
            Rango personalizado
          </option>
        </select>

        {showCustomPicker ? (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={dateInputClass}
            />
            <span className="text-brand-muted text-sm">-</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={dateInputClass}
            />
            <button
              type="button"
              disabled={!canApply}
              onClick={handleApply}
              className="h-9 px-3 rounded-lg text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 whitespace-nowrap"
              style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "var(--club-bg, #001A24)" }}
            >
              Aplicar
            </button>
          </>
        ) : (
          <span className="text-[11px] text-brand-muted whitespace-nowrap">{dateRangeLabel}</span>
        )}
      </div>

      {isInvalidRange && (
        <p className="text-[11px] text-red-400">
          La fecha final debe ser igual o posterior a la fecha inicial.
        </p>
      )}
    </div>
  );
}
