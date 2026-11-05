"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Building2, CalendarPlus } from "lucide-react";
import { VenueContactActions } from "@/components/directory/VenueContactActions";
import type { PadelVenue } from "@/lib/directory";

// Establecimientos del directorio que NO son (o no están visibles como)
// clubes del SaaS. Presentación neutral: ícono genérico (nunca logo ni
// fotos de terceros), sin insignias de afiliación, sin promesas de
// reservas, horarios, precios ni disponibilidad. Las únicas acciones son
// los contactos comerciales reales que tenga la ficha y organizar un
// partido abierto allí (que tampoco reserva nada).

function organizeHref(venue: PadelVenue): string {
  const qs = new URLSearchParams({ ciudad: venue.municipality, lugar: venue.id });
  return `/partidos/crear?${qs}`;
}

function VenueIcon({ large }: { large?: boolean }) {
  return (
    <div
      className={
        large
          ? "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/5 border border-white/10 lg:w-16 lg:h-16 lg:rounded-2xl"
          : "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/5 border border-white/10"
      }
      aria-hidden="true"
    >
      <Building2 className={large ? "w-5 h-5 text-brand-muted lg:w-6 lg:h-6" : "w-4 h-4 text-brand-muted"} />
    </div>
  );
}

function OrganizeLink({ venue, compact }: { venue: PadelVenue; compact?: boolean }) {
  return (
    <Link
      href={organizeHref(venue)}
      className={
        compact
          ? "inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline"
          : "inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/10 transition-colors"
      }
    >
      <CalendarPlus className="w-3.5 h-3.5" />
      Organizar partido aquí
    </Link>
  );
}

interface ItemProps {
  venue: PadelVenue;
  isActive: boolean;
  onTap: (venue: PadelVenue) => void;
  onHover?: (id: string | null) => void;
}

// Desktop: misma rejilla compacta que ClubDirectoryCard.
export const VenueDirectoryCard = forwardRef<HTMLDivElement, ItemProps>(function VenueDirectoryCard(
  { venue, isActive, onTap, onHover },
  ref
) {
  return (
    <div
      ref={ref}
      onMouseEnter={() => onHover?.(venue.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onTap(venue)}
      className={`flex flex-col gap-2 p-3 rounded-xl bg-brand-surface border transition-colors ${
        isActive ? "border-white/40" : "border-white/10 hover:border-white/20"
      }`}
    >
      <div className="flex flex-col items-center text-center gap-1.5">
        <VenueIcon large />
        <div className="w-full min-w-0">
          <p className="text-xs font-semibold text-white truncate">{venue.name}</p>
          <p className="text-[11px] text-brand-muted truncate">{[venue.municipality, venue.department].join(", ")}</p>
          {venue.address && <p className="text-[11px] text-brand-muted/70 truncate">{venue.address}</p>}
        </div>
      </div>
      <VenueContactActions venue={venue} size="sm" className="flex-wrap [&>a]:basis-full [&>a]:h-8" />
      <OrganizeLink venue={venue} />
    </div>
  );
});

// Mobile: fila táctil con contactos visibles (no hay un "detalle" al que
// navegar: la ficha completa es la propia fila).
export const VenueDirectoryRow = forwardRef<HTMLDivElement, ItemProps>(function VenueDirectoryRow(
  { venue, isActive, onTap },
  ref
) {
  return (
    <div
      ref={ref}
      onClick={() => onTap(venue)}
      className={`flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-brand-surface border transition-colors ${
        isActive ? "border-white/40" : "border-white/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <VenueIcon />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{venue.name}</p>
          <p className="text-[11px] text-brand-muted truncate">
            {[venue.address, venue.municipality].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <VenueContactActions venue={venue} size="sm" />
      <OrganizeLink venue={venue} compact />
    </div>
  );
});
