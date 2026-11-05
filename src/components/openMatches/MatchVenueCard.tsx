import Link from "next/link";
import { Building2 } from "lucide-react";
import { VenueContactActions } from "@/components/directory/VenueContactActions";
import { formatOpenMatchDayLong, formatOpenMatchTime, type OpenMatch } from "@/lib/openMatches";
import type { OpenMatchVenue } from "@/lib/directory";

// Establecimiento del directorio elegido para un partido abierto: dirección,
// ubicación y contacto comercial para preguntar por una cancha. Nunca
// sugiere que haya cancha reservada, disponibilidad o confirmación del
// establecimiento (eso es court_status, declarado por el organizador).
export function MatchVenueCard({ match, venue, active }: { match: OpenMatch; venue: OpenMatchVenue; active: boolean }) {
  const ask = `Hola, encontré su establecimiento en el directorio de Mi Pádel Club. ¿Tienen cancha disponible el ${formatOpenMatchDayLong(
    match.matchDate
  )} a las ${formatOpenMatchTime(match.startTime)}?`;

  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3" aria-label="Establecimiento">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Building2 className="h-4 w-4 text-brand-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white break-words">{venue.name}</p>
          <p className="text-xs text-brand-muted break-words">
            {[venue.address, venue.municipality, venue.department].filter(Boolean).join(" · ")}
          </p>
          {venue.club && (
            <Link href={`/${venue.club.slug}`} className="mt-1 inline-block text-xs font-medium text-brand-primary hover:underline">
              Usa Mi Pádel Club · Ver club
            </Link>
          )}
        </div>
      </div>

      {venue.isPublished ? (
        <>
          {active && <VenueContactActions venue={venue} whatsappMessage={ask} size="sm" className="mt-3" />}
          <p className="mt-2 text-[11px] text-brand-muted">
            Lugar elegido por el organizador. No implica cancha reservada ni confirmación del establecimiento.
          </p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-brand-muted">Este establecimiento ya no aparece en el directorio.</p>
      )}
    </section>
  );
}
