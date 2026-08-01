import { MessageCircle } from "lucide-react";
import { MARKETING_WA_URL } from "@/lib/constants/marketingWhatsapp";

// Sección final de la Landing pública, justo antes del footer — nunca
// importada fuera de (marketing)/page.tsx, así que nunca puede aparecer
// dentro de la app (dashboards, panel Owner/Admin/Jugador). Inspirada en la
// experiencia de SolarDesk (icono + pregunta + acompañamiento + botón de
// WhatsApp) pero con el estilo visual ya establecido en el resto de la
// landing (misma tarjeta bordeada con glow que PainPoints/Audience), nunca
// una copia literal. Reutiliza MARKETING_WA_URL — mismo número/mensaje que
// ya usan Hero y Audience, nunca un segundo enlace de WhatsApp inventado.
export default function WhatsAppSupport() {
  return (
    <section className="border-t border-white/5 bg-brand-bg py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-brand-surface p-10 text-center lg:p-14">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[420px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative flex flex-col items-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
              <MessageCircle className="h-7 w-7 text-emerald-400" strokeWidth={2} />
            </div>

            <h2 className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              ¿Tienes preguntas?
            </h2>

            <p className="mb-8 max-w-lg text-base leading-relaxed text-brand-muted">
              Estamos acompañando personalmente a los clubes y jugadores que quieren comenzar a usar Mi Pádel Club.
            </p>

            <a
              href={MARKETING_WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-500/90"
            >
              <MessageCircle className="h-4 w-4" />
              Hablar por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
