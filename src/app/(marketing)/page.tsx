import Hero from "@/components/features/marketing/Hero";
import PainPoints from "@/components/features/marketing/PainPoints";
import Features from "@/components/features/marketing/Features";
import Audience from "@/components/features/marketing/Audience";
import WhatsAppSupport from "@/components/features/marketing/WhatsAppSupport";

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <PainPoints />
      <Features />
      <Audience />
      {/* Únicamente en la Landing pública — nunca importado dentro de la
          app (ver (app)/[club], (app)/profile, platform), así que nunca
          puede aparecer en ningún dashboard. */}
      <WhatsAppSupport />
    </>
  );
}
