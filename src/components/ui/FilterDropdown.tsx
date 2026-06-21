"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface FilterDropdownOption<T extends string> {
  value: T;
  label: string;
}

interface FilterDropdownProps<T extends string> {
  label: string;
  value: T;
  defaultValue: T;
  options: FilterDropdownOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

// Jira/Linear-style filter trigger — a pill button showing "Label: value"
// that opens a small menu of options. Same open/close-on-click-outside
// pattern as WeekCalendar's ActionMenu, just generic over the option type.
export function FilterDropdown<T extends string>({
  label,
  value,
  defaultValue,
  options,
  onChange,
  className,
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? value;
  const isActive = value !== defaultValue;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-medium whitespace-nowrap transition-colors",
          isActive
            ? "bg-brand-primary/15 text-brand-primary border border-brand-primary/30"
            : "bg-white/5 text-brand-muted border border-white/10 hover:border-white/20 hover:text-white"
        )}
      >
        {label}: {currentLabel}
        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-[#0e3347] border border-white/20 rounded-xl shadow-xl overflow-hidden min-w-[170px] z-[50] py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors"
            >
              {opt.label}
              {opt.value === value && <Check className="w-3.5 h-3.5 text-brand-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
