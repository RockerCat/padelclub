import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EMPTY_VENUE_FORM } from "@/lib/directory";
import { VenueForm } from "../VenueForm";

export default function NewPlatformVenuePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      <Link href="/platform/venues" className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" />
        Directorio
      </Link>
      <h1 className="text-xl font-bold text-white mb-1">Nuevo establecimiento</h1>
      <p className="text-sm text-brand-muted mb-8">
        Se crea como borrador (no visible). Publícalo cuando tenga dirección, fuente y fecha de verificación. Registrarlo no
        crea cuentas, propietarios ni suscripciones.
      </p>
      <VenueForm venueId={null} initial={EMPTY_VENUE_FORM} />
    </div>
  );
}
