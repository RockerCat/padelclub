import Link from "next/link";
import { LayoutDashboard, ClipboardList, Search, Check, ChevronDown } from "lucide-react";
import { RegisterMenu } from "./RegisterMenu";
import { MARKETING_WA_URL as WA_URL } from "@/lib/constants/marketingWhatsapp";

const profiles = [
  {
    icon: LayoutDashboard,
    iconColor: "primary" as const,
    role: "Dueño del Club",
    description: "Obtén visibilidad completa sobre la actividad de tu club.",
    benefits: [
      "Ocupación de canchas",
      "Jugadores activos",
      "Nuevos jugadores",
      "Participación en torneos",
      "Actividad del club",
      "Indicadores clave",
    ],
    prominent: true,
  },
  {
    icon: ClipboardList,
    iconColor: "secondary" as const,
    role: "Administrador",
    description: "Gestiona la operación diaria desde una única plataforma.",
    benefits: [
      "Reservas y canchas",
      "Jugadores y clínicas",
      "Torneos y resultados",
      "Rankings automáticos",
      "Historial completo",
      "Flujo sin WhatsApp",
    ],
    prominent: false,
  },
  {
    icon: Search,
    iconColor: "secondary" as const,
    role: "Jugador",
    description: "Reserva canchas y sigue tu propia evolución dentro del club.",
    benefits: [
      "Reservar canchas en línea",
      "Ver disponibilidad en tiempo real",
      "Participar en torneos",
      "Seguir tu ranking y categoría",
      "Ver tu evolución y logros",
      "Noticias del club",
    ],
    prominent: false,
  },
];

function ProfileCard({
  icon: Icon,
  iconColor,
  role,
  description,
  benefits,
  prominent,
}: (typeof profiles)[0]) {
  const iconBg =
    iconColor === "primary" ? "bg-brand-primary/15" : "bg-brand-secondary/15";
  const iconFg =
    iconColor === "primary" ? "text-brand-primary" : "text-brand-secondary";
  const checkBg =
    iconColor === "primary" ? "bg-brand-primary/15" : "bg-brand-secondary/15";
  const checkFg =
    iconColor === "primary" ? "text-brand-primary" : "text-brand-secondary";
  const borderClass = prominent
    ? "border-brand-primary/25 hover:border-brand-primary/40"
    : "border-white/10 hover:border-white/20";

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-brand-surface p-8 transition-all duration-300 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5 ${borderClass}`}
    >
      {prominent && (
        <div className="absolute -top-px left-0 right-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-brand-primary/50 to-transparent" />
      )}

      <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-6 w-6 ${iconFg}`} strokeWidth={2} />
      </div>

      <h3 className="mb-2 text-xl font-bold text-white">{role}</h3>
      <p className="mb-6 text-sm leading-relaxed text-brand-muted">{description}</p>

      <ul className="space-y-2.5">
        {benefits.map((b) => (
          <li key={b} className="flex items-center gap-3">
            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${checkBg}`}>
              <Check className={`h-2.5 w-2.5 ${checkFg}`} strokeWidth={3} />
            </div>
            <span className="text-sm text-white/80">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Audience() {
  return (
    <section className="border-t border-white/5 bg-brand-bg py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-brand-primary">
              Para quién es
            </span>
          </div>
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Para clubs y jugadores de pádel.
          </h2>
          <p className="text-lg leading-relaxed text-brand-muted">
            Tanto si gestionas un club como si buscas dónde jugar, MiPadelClub tiene lo que necesitas.
          </p>
        </div>

        {/* Profile cards */}
        <div className="mb-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {profiles.map((p) => (
            <ProfileCard key={p.role} {...p} />
          ))}
        </div>

        {/* Central message + CTA */}
        <div
          id="contacto"
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-brand-surface p-10 text-center lg:p-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-primary/5 via-transparent to-brand-secondary/5" />
          <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[500px] -translate-x-1/2 rounded-full bg-brand-primary/8 blur-3xl" />

          <div className="relative">
            <h3 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Los clubes crecen cuando sus jugadores participan.
            </h3>
            <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-brand-muted">
              MiPadelClub reúne administración, competencia y comunidad en una sola plataforma — para que tu club
              opere mejor y tus jugadores quieran volver cada semana.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
              <RegisterMenu
                align="left"
                triggerClassName="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-7 py-3.5 text-base font-semibold text-brand-bg shadow-lg shadow-brand-primary/20 transition-colors hover:bg-brand-primary/90"
                triggerContent={
                  <>
                    Registrarme
                    <ChevronDown className="h-4 w-4" />
                  </>
                }
              />
              <Link
                href="/clubs"
                className="inline-flex items-center rounded-xl border border-white/20 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/5"
              >
                Explorar clubes →
              </Link>
            </div>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-muted hover:text-white transition-colors"
            >
              ¿Tienes preguntas? Hablar por WhatsApp →
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
