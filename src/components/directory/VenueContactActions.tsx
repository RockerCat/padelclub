import { MapPin, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { venueMapsHref, venueTelHref, venueWhatsappHref, type PadelVenue } from "@/lib/directory";

// Botones de contacto comercial de un establecimiento del directorio
// (Cómo llegar / Llamar / WhatsApp). Solo se muestra el botón que tiene un
// dato real detrás — nunca un botón inactivo para un servicio inexistente.
// Reutilizado por el directorio (/clubs) y por el detalle de un partido
// abierto: una sola presentación y una sola regla de enlaces seguros.

interface Props {
  venue: Pick<PadelVenue, "name" | "address" | "municipality" | "department" | "mapsUrl" | "latitude" | "longitude" | "phone" | "whatsapp">;
  /** Mensaje prellenado de WhatsApp (p. ej. con fecha/hora del partido). */
  whatsappMessage?: string;
  size?: "sm" | "md";
  className?: string;
}

export function hasVenueContact(venue: Props["venue"]): boolean {
  return !!(venueMapsHref(venue) || venueTelHref(venue.phone) || venueWhatsappHref(venue.whatsapp));
}

export function VenueContactActions({ venue, whatsappMessage, size = "md", className }: Props) {
  const maps = venueMapsHref(venue);
  const tel = venueTelHref(venue.phone);
  const wa = venueWhatsappHref(venue.whatsapp, whatsappMessage);
  if (!maps && !tel && !wa) return null;

  const base = cn(
    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border font-medium transition-colors min-w-0",
    size === "sm" ? "h-9 px-2.5 text-xs" : "h-10 px-3 text-sm"
  );
  const neutral = "border-white/15 text-white hover:border-white/30 hover:bg-white/5";

  return (
    <div className={cn("flex gap-2", className)}>
      {maps && (
        <a href={maps} target="_blank" rel="noopener noreferrer" className={cn(base, neutral)} aria-label={`Cómo llegar a ${venue.name}`}>
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">Cómo llegar</span>
        </a>
      )}
      {tel && (
        <a href={tel} className={cn(base, neutral)} aria-label={`Llamar a ${venue.name}`}>
          <Phone className="h-4 w-4 shrink-0" />
          <span className="truncate">Llamar</span>
        </a>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(base, "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15")}
          aria-label={`Escribir por WhatsApp a ${venue.name}`}
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">WhatsApp</span>
        </a>
      )}
    </div>
  );
}
