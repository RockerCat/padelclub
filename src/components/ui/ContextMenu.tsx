"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ContextMenuAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface ContextMenuProps {
  actions: ContextMenuAction[];
  className?: string;
}

// Generic ⋮ dropdown — same click-outside-to-close pattern as
// WeekCalendar's ActionMenu and FilterDropdown, generalized over an
// arbitrary action list. Used to move destructive actions (e.g. "Quitar
// administrador") behind a deliberate extra click instead of an
// always-visible icon next to every row.
export function ContextMenu({ actions, className }: ContextMenuProps) {
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

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-brand-muted/60 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Más acciones"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[#0e3347] border border-white/20 rounded-xl shadow-xl overflow-hidden min-w-[180px] z-[200] py-1">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  action.onClick();
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors",
                  action.variant === "danger"
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-white hover:bg-white/5"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
