"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { cn } from "@/lib/utils/cn";

export interface PlayerComboboxCandidate {
  club_member_id: string;
  full_name: string | null;
  avatar_url: string | null;
  category: string;
}

interface PlayerComboboxProps {
  label: string;
  candidates: PlayerComboboxCandidate[];
  excludeIds: string[];
  value: string | null;
  onChange: (clubMemberId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Small, module-specific combobox — no equivalent reusable component exists
// yet elsewhere (audited: FilterDropdown is a fixed-options menu, not a
// searchable player list). Candidate lists here are always small (a club's
// players in a single category, max_pairs typically small), so a plain filtered
// list with no virtualization/debounce is enough — never a generic global
// combobox system.
export function PlayerCombobox({
  label,
  candidates,
  excludeIds,
  value,
  onChange,
  disabled,
  placeholder = "Buscar jugador...",
}: PlayerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const excluded = new Set(excludeIds);
  const selected = candidates.find((c) => c.club_member_id === value) ?? null;
  const filtered = candidates.filter((c) => {
    if (excluded.has(c.club_member_id) && c.club_member_id !== value) return false;
    if (!query.trim()) return true;
    return (c.full_name ?? "").toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      <label className="text-sm font-medium text-white/80">{label}</label>

      {selected ? (
        <div className="flex items-center gap-2.5 h-12 px-3 rounded-xl border border-white/10 bg-white/5">
          <PlayerSportAvatar
            player={{ id: selected.club_member_id, full_name: selected.full_name, avatar_url: selected.avatar_url }}
            size="sm"
            sportCategory={selected.category}
          />
          <span className="text-sm text-white flex-1 min-w-0 truncate">{selected.full_name ?? "Jugador"}</span>
          <span className="text-xs text-brand-muted shrink-0">{selected.category}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors shrink-0"
              aria-label={`Quitar ${selected.full_name ?? "jugador"}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              disabled={disabled}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              placeholder={placeholder}
              className="w-full h-10 rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {open && !disabled && (
            <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-[#0e3347] border border-white/20 rounded-xl shadow-xl z-[420] py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-brand-muted">Sin jugadores disponibles.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.club_member_id}
                    type="button"
                    onClick={() => {
                      onChange(c.club_member_id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                    )}
                  >
                    <PlayerSportAvatar
                      player={{ id: c.club_member_id, full_name: c.full_name, avatar_url: c.avatar_url }}
                      size="sm"
                      sportCategory={c.category}
                    />
                    <span className="text-sm text-white truncate min-w-0 flex-1">{c.full_name ?? "Jugador"}</span>
                    <span className="text-xs text-brand-muted shrink-0">{c.category}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
