import { ChevronDown } from "lucide-react";
import {
  LAUNCH_PRICING_FROM_YEAR,
  formatMonthlyPrice,
  formatTrialLength,
  type PublicCommercialOffer,
} from "@/lib/commercialOffer";

// Preguntas frecuentes comerciales (#preguntas). <details> nativo: sin JS,
// accesible y legible en móvil. Las respuestas describen SOLO condiciones
// confirmadas — en particular, "¿qué ocurre cuando termina la prueba?" no
// promete ninguna política de gracia/bloqueo que no esté aprobada.

// Ejemplo de fechas: día 20 nunca se ajusta por fin de mes, así que sumar
// meses es directo. La regla real (con ajuste de fin de mes y zona horaria
// de Bogotá) vive en SQL — compute_trial_ends_at.
function trialExample(months: number): { from: string; to: string } {
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return { from: fmt(new Date(Date.UTC(2026, 10, 20))), to: fmt(new Date(Date.UTC(2026, 10 + months, 20))) };
}

function buildFaqs(offer: PublicCommercialOffer | null): { q: string; a: string }[] {
  const trial = offer ? formatTrialLength(offer) : null;
  const price = offer ? formatMonthlyPrice(offer) : null;
  const example = offer?.trialMonths ? trialExample(offer.trialMonths) : null;

  return [
    {
      q: trial ? `¿Cómo funcionan los ${trial} gratis?` : "¿Cómo funciona la prueba gratuita?",
      a:
        `La prueba empieza el día en que activas tu club, no cuando solicitas la demo ni mientras lo preparamos contigo.` +
        (trial ? ` Dura ${trial}${offer?.trialMonths ? " calendario" : ""} completos.` : "") +
        (example ? ` Por ejemplo, si activas tu club el ${example.from}, la prueba va hasta el ${example.to}.` : ""),
    },
    {
      q: "¿Necesito tarjeta de crédito?",
      a: "No. Para activar la prueba no pedimos tarjeta de crédito ni ningún otro medio de pago.",
    },
    {
      q: "¿Cuánto cuesta después?",
      a: price
        ? `${price} al mes por club, a partir de ${LAUNCH_PRICING_FROM_YEAR}, una vez termina tu prueba gratuita.`
        : "Te compartimos el precio vigente durante la demo.",
    },
    {
      q: "¿Puedo registrar mi club directamente?",
      a: "No. Los clubes se incorporan con acompañamiento: solicitas una demo y nuestro equipo prepara tu club contigo. El registro público de la plataforma es solo para jugadores.",
    },
    {
      q: "¿Cómo se activa mi club?",
      a: "Solicitas la demo, te contactamos por WhatsApp para coordinarla y dejamos tu club configurado contigo (canchas, horarios, tarifas e imagen). Luego te enviamos un enlace personal para reclamar tu club como propietario: en ese momento queda activado y empieza tu prueba gratuita.",
    },
    {
      q: "¿Qué ocurre cuando termina la prueba?",
      a: "No hacemos ningún cobro automático y no eliminamos la información de tu club. Para continuar, activas el plan mensual desde tu panel de propietario.",
    },
  ];
}

export default function Faq({ offer }: { offer: PublicCommercialOffer | null }) {
  const faqs = buildFaqs(offer);
  return (
    <section id="preguntas" className="border-t border-white/5 bg-brand-bg py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-brand-primary">
              Preguntas frecuentes
            </span>
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Lo que preguntan los clubes.</h2>
        </div>

        <div className="space-y-3">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-2xl border border-white/10 bg-brand-surface px-6 py-5 open:border-brand-primary/30"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="h-5 w-5 shrink-0 text-brand-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-brand-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
