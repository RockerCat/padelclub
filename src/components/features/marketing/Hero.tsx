import Link from "next/link";
import Image from "next/image";
import { Calendar, BarChart2, Trophy } from "lucide-react";
import { MARKETING_WA_URL as WA_URL } from "@/lib/constants/marketingWhatsapp";
import { LAUNCH_PRICING_FROM_YEAR, formatMonthlyPrice, formatTrialLength, type PublicCommercialOffer } from "@/lib/commercialOffer";

// ─── Feature highlights ───────────────────────────────────────────────────────

const highlights = [
  { icon: Calendar, label: "Reservas", sub: "Canchas y disponibilidad" },
  { icon: Trophy, label: "Torneos", sub: "Inscripciones y clasificación" },
  { icon: BarChart2, label: "Ranking", sub: "Evolución de cada jugador" },
];

// ─── Hero ─────────────────────────────────────────────────────────────────────

// `offer` viene de commercial_settings (ver src/lib/commercialOffer.ts) —
// null solo si la lectura falla; en ese caso el hero omite la duración del
// trial en vez de prometer una cifra que el sistema no respalda.
export default function Hero({ offer }: { offer: PublicCommercialOffer | null }) {
  const trial = offer ? formatTrialLength(offer) : null;
  const price = offer ? formatMonthlyPrice(offer) : null;
  return (
    <section className="relative min-h-screen flex items-center pt-16 lg:pt-20 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-1/3 -left-72 w-[700px] h-[700px] rounded-full bg-brand-secondary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-72 w-[600px] h-[600px] rounded-full bg-brand-primary/5 blur-3xl pointer-events-none" />

      {/* Imagen del producto (decorativa) — desktop: capa a la derecha con
          borde izquierdo difuminado para no competir con el texto. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 hidden w-[72%] lg:block"
        style={{
          WebkitMaskImage: "linear-gradient(to right, transparent, black 28%)",
          maskImage: "linear-gradient(to right, transparent, black 28%)",
        }}
      >
        <Image
          src="/img/landing/hero-dashboard.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 72vw, 0px"
          className="object-contain object-right"
        />
      </div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid gap-12 items-center">

          {/* ── Copy ── */}
          <div className="lg:max-w-[46%]">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
              <span className="text-xs font-medium text-brand-primary tracking-widest uppercase">
                Para dueños de clubes de pádel
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-[3.5rem] font-bold leading-[1.06] tracking-tight text-white">
              Tu club de pádel, listo para operar.
              {trial && (
                <>
                  <br />
                  <span className="text-brand-primary">¡Gratis por {trial}!</span>
                </>
              )}
            </h1>

            {/* Subheadline */}
            <p className="mt-6 text-lg text-brand-muted leading-relaxed max-w-[460px]">
              Nosotros te ayudamos a configurarlo. Tú empiezas a gestionar reservas,
              jugadores, rankings y torneos desde un solo lugar.
            </p>

            {/* Primary CTA — sales-assisted onboarding: a demo request, never
                a self-service form, is the commercial entry point for club
                owners. Plain Link so /demo is directly shareable from
                Instagram/Facebook/WhatsApp/email/campaigns. Public
                self-registration is PLAYER-only (see CLAUDE.md → Funnel
                Comercial Principles) and lives in the Navbar's
                RegisterMenu, never here. */}
            <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4 max-w-[560px]">
              <Link
                href="/demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-7 py-3.5 text-base font-semibold text-brand-bg hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/20"
              >
                Empezar con mi club
              </Link>
              <Link
                href="/clubs"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3.5 text-base font-semibold text-white text-center hover:bg-white/5 transition-colors"
              >
                Explorar clubes
              </Link>
            </div>

            <p className="mt-4 text-sm text-brand-muted max-w-[560px]">
              Sin tarjeta de crédito · Configuración asistida · Sin cláusula de permanencia
            </p>
            {trial && price && (
              <p className="mt-2 text-sm font-medium text-white max-w-[560px]">
                Después de los {trial} gratis: {price}/mes por club, a partir de {LAUNCH_PRICING_FROM_YEAR}.
              </p>
            )}

            {/* WhatsApp — secondary, sales only */}
            <p className="mt-4 text-sm text-brand-muted">
              ¿Tienes preguntas?{" "}
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-brand-primary transition-colors"
              >
                Hablar por WhatsApp →
              </a>
            </p>

            {/* Feature highlights */}
            <div className="mt-12 pt-8 border-t border-white/8 grid grid-cols-3 gap-5">
              {highlights.map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className="h-3.5 w-3.5 text-brand-primary shrink-0"
                      strokeWidth={2.5}
                    />
                    <span className="text-sm font-semibold text-white">
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-brand-muted leading-snug">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Imagen (tablet/móvil): debajo del contenido ── */}
          <div className="lg:hidden" aria-hidden="true">
            <Image
              src="/img/landing/hero-dashboard.jpg"
              alt=""
              width={1672}
              height={941}
              sizes="(min-width: 640px) 90vw, 100vw"
              className="h-auto w-full rounded-2xl"
            />
          </div>

        </div>
      </div>
    </section>
  );
}
