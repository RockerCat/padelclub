import type { Metadata } from "next";
import Hero from "@/components/features/marketing/Hero";
import PainPoints from "@/components/features/marketing/PainPoints";
import Features from "@/components/features/marketing/Features";
import ProductShowcase from "@/components/features/marketing/ProductShowcase";
import LaunchOffer from "@/components/features/marketing/LaunchOffer";
import Audience from "@/components/features/marketing/Audience";
import Faq from "@/components/features/marketing/Faq";
import WhatsAppSupport from "@/components/features/marketing/WhatsAppSupport";
import { formatTrialLength, getPublicCommercialOffer } from "@/lib/commercialOffer";

// Metadatos de la landing derivados de la misma oferta que muestra la
// página (commercial_settings) — nunca una cifra que el sistema no aplique.
// Solo title/description: Next fusiona metadata de forma superficial, así
// que sobrescribir openGraph/twitter aquí descartaría la imagen/locale que
// define el layout raíz.
export async function generateMetadata(): Promise<Metadata> {
  const offer = await getPublicCommercialOffer();
  const trial = offer ? formatTrialLength(offer) : null;
  const title = trial
    ? `Mi Pádel Club — Software para clubes de pádel · ${trial} gratis`
    : "Mi Pádel Club — Software para clubes de pádel";
  const description = trial
    ? `Reservas, jugadores, ranking y torneos para tu club de pádel. Agenda una demo, te ayudamos a configurarlo y lo usas gratis por ${trial}. Sin tarjeta de crédito.`
    : "Reservas, jugadores, ranking y torneos para tu club de pádel. Agenda una demo y te ayudamos a configurarlo. Sin tarjeta de crédito.";
  return { title, description };
}

export default async function MarketingPage() {
  const offer = await getPublicCommercialOffer();
  return (
    <>
      <Hero offer={offer} />
      <PainPoints />
      <Features />
      <ProductShowcase />
      <LaunchOffer offer={offer} />
      <Audience offer={offer} />
      <Faq offer={offer} />
      {/* Únicamente en la Landing pública — nunca importado dentro de la
          app (ver (app)/[club], (app)/profile, platform), así que nunca
          puede aparecer en ningún dashboard. */}
      <WhatsAppSupport />
    </>
  );
}
