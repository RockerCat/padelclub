import type { Metadata } from "next";
import { Check } from "lucide-react";
import { DemoForm } from "./DemoForm";
import {
  LAUNCH_PRICING_FROM_YEAR,
  formatMonthlyPrice,
  formatTrialLength,
  getPublicCommercialOffer,
} from "@/lib/commercialOffer";

// Misma oferta que la landing (commercial_settings) — nunca cifras propias.
export async function generateMetadata(): Promise<Metadata> {
  const offer = await getPublicCommercialOffer();
  const trial = offer ? formatTrialLength(offer) : null;
  return {
    title: trial ? `Agenda tu demo y obtén ${trial} gratis | Mi Pádel Club` : "Agenda tu demo | Mi Pádel Club",
    description:
      "Cuéntanos sobre tu club y coordinamos una demo de Mi Pádel Club por WhatsApp. Te ayudamos a configurarlo — reservas, jugadores, ranking y torneos. Sin tarjeta de crédito.",
  };
}

// Página pública, compartible directamente (Instagram, Facebook, WhatsApp,
// email, campañas) — nunca un modal. Hereda Navbar/Footer del grupo
// (marketing). Server Component; toda la interactividad vive en DemoForm
// (Client Component). Enviar el formulario solo crea un commercial_lead —
// nunca un club, un OWNER ni el inicio de la prueba (eso ocurre únicamente
// en claim_club()).
export default async function DemoPage() {
  const offer = await getPublicCommercialOffer();
  const trial = offer ? formatTrialLength(offer) : null;
  const price = offer ? formatMonthlyPrice(offer) : null;
  const perks = [
    trial ? `${trial} gratis desde la activación de tu club` : "Prueba gratuita desde la activación de tu club",
    "Te ayudamos a configurar tu club",
    "Sin tarjeta de crédito",
  ];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-lg mx-auto px-5 pt-28 pb-20 sm:pt-32">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          Empecemos con tu club
        </h1>
        <p className="text-brand-muted mb-6 leading-relaxed">
          Cuéntanos sobre tu club y nos pondremos en contacto contigo para
          mostrarte MiPadelClub y ayudarte a ponerlo en marcha.
        </p>
        <ul className="mb-4 space-y-2">
          {perks.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-white">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" strokeWidth={2.5} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {price && (
          <p className="mb-10 text-sm text-brand-muted">
            Después: {price}/mes por club, a partir de {LAUNCH_PRICING_FROM_YEAR}, una vez termina la prueba gratuita.
          </p>
        )}
        {!price && <div className="mb-10" />}
        <DemoForm />
      </div>
    </div>
  );
}
