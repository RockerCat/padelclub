"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarPlus, CalendarCheck, Trophy, FlagOff, Star, ArrowUpDown, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PlayerActivityEvent } from "@/lib/playerDashboard";

const EVENT_ICON: Record<PlayerActivityEvent["type"], LucideIcon> = {
  reservation_created: CalendarPlus,
  reservation_confirmed: CalendarCheck,
  tournament_entry_created: Trophy,
  tournament_completed: FlagOff,
  points_movement: Star,
  category_change: ArrowUpDown,
};

// timeZone explícito (mismo huso que el resto del proyecto usa para fechas
// visibles al usuario, ver SportEvolutionSection.tsx) — aquí el contenido
// solo se renderiza tras abrir el acordeón (interacción del usuario, ya
// post-hidratación), así que no hay riesgo de hydration mismatch, pero se
// mantiene explícito de todas formas para que la fecha mostrada sea
// siempre la del calendario de Colombia, sin importar el huso del
// dispositivo del jugador.
function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" });
}

// Sección 7 del spec — "Actividad reciente", ahora un acordeón cerrado por
// defecto (pedido de presentación): `items` ya viene unido, ordenado y
// completo desde playerDashboard.ts (getPlayerRecentActivity) en el
// render del servidor — abrir/cerrar es únicamente estado visual local,
// nunca dispara una nueva consulta ni recalcula nada. Fechas siempre
// absolutas (día/mes/año), sin cambios respecto a la versión anterior.
export function RecentActivitySection({ items }: { items: PlayerActivityEvent[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-white">Actividad reciente</h2>
          <span className="text-xs text-brand-muted shrink-0">({items.length})</span>
        </span>
        <ChevronDown className={cn("w-4 h-4 text-brand-muted shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="flex flex-col gap-3 px-5 pb-5 pt-1 border-t border-white/10">
          {items.map((item) => {
            const Icon = EVENT_ICON[item.type];
            const content = (
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-brand-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{item.label}</p>
                  <p className="text-[11px] text-brand-muted/70">{formatAbsoluteDate(item.at)}</p>
                </div>
              </div>
            );
            return (
              <li key={item.id} className="pt-3 first:pt-0">
                {item.href ? (
                  <Link href={item.href} className="block hover:opacity-80 transition-opacity">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
