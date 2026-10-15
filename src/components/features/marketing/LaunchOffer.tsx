import Link from "next/link";
import { Check } from "lucide-react";
import {
  LAUNCH_PRICING_FROM_YEAR,
  formatMonthlyPrice,
  formatTrialLength,
  type PublicCommercialOffer,
} from "@/lib/commercialOffer";

// Sección comercial de la landing (#precios). Precio y duración del trial
// salen de commercial_settings vía `offer` — nunca cifras escritas aquí. Si
// la lectura falla (offer null) la sección se mantiene pero sin cifras.
//
// Solo se listan capacidades verificadas en el producto actual (ver
// CLAUDE.md): nada de pagos en línea para jugadores, ni app de
// administración móvil, ni resultados de partidos.
const included = [
  "Reservas de canchas con calendario y solicitudes de jugadores",
  "Canchas, horarios y tarifas configurables",
  "Jugadores, solicitudes de ingreso y contacto por WhatsApp",
  "Ranking por categoría que se actualiza al cerrar cada torneo",
  "Torneos: inscripción de duplas y clasificación por puntos",
  "Página pública del club, noticias y estadísticas de ocupación",
];

export default function LaunchOffer({ offer }: { offer: PublicCommercialOffer | null }) {
  const trial = offer ? formatTrialLength(offer) : null;
  const price = offer ? formatMonthlyPrice(offer) : null;

  const conditions = [
    trial ? `${trial} gratis desde la activación de tu club` : "Prueba gratuita desde la activación de tu club",
    "Configuración inicial asistida por nuestro equipo",
    "Sin tarjeta de crédito ni medio de pago para empezar",
    "Sin cobros automáticos",
  ];

  return (
    <section id="precios" className="border-t border-white/5 bg-brand-bg py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-brand-primary">
              Lanzamiento
            </span>
          </div>
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {trial ? `${trial[0].toUpperCase()}${trial.slice(1)} gratis para tu club.` : "Prueba gratis para tu club."}
          </h2>
          <p className="text-lg leading-relaxed text-brand-muted">
            Te ayudamos a configurar tu club y empiezas a operar sin tarjeta de crédito.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Precio + condiciones */}
          <div className="relative overflow-hidden rounded-3xl border border-brand-primary/30 bg-brand-surface p-8 lg:p-10">
            <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-brand-primary/10 blur-3xl" />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-primary">Plan club</p>
              {price ? (
                <>
                  <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-white">
                    <span className="text-4xl font-bold tracking-tight sm:text-5xl">{price}</span>
                    <span className="text-base text-brand-muted">/ mes por club</span>
                  </p>
                  <p className="mt-2 text-sm text-brand-muted">
                    A partir de {LAUNCH_PRICING_FROM_YEAR}, después de la prueba gratuita.
                  </p>
                </>
              ) : (
                <p className="mt-4 text-base text-brand-muted">Te compartimos el precio en la demo.</p>
              )}

              <ul className="mt-8 space-y-3">
                {conditions.map((c) => (
                  <li key={c} className="flex items-start gap-3 text-sm text-white">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" strokeWidth={2.5} />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/demo"
                className="mt-10 inline-flex w-full items-center justify-center rounded-xl bg-brand-primary px-7 py-3.5 text-center text-base font-semibold text-brand-bg shadow-lg shadow-brand-primary/20 transition-colors hover:bg-brand-primary/90"
              >
                {trial ? `Agenda tu demo y obtén ${trial} gratis` : "Agenda tu demo"}
              </Link>
            </div>
          </div>

          {/* Qué incluye */}
          <div className="rounded-3xl border border-white/10 bg-brand-surface p-8 lg:p-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-muted">Qué incluye</p>
            <ul className="mt-6 space-y-4">
              {included.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-brand-muted">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-secondary" strokeWidth={2.5} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-xs leading-relaxed text-brand-muted">
              El registro de jugadores es gratuito. Los clubes se incorporan con acompañamiento: solicita tu
              demo y preparamos tu club contigo.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
