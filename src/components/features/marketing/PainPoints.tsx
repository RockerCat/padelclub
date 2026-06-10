import Link from "next/link";
import { Smartphone, FileSpreadsheet, GitFork, Layers, Calendar, BarChart2, Trophy, Users } from "lucide-react";

const problems = [
  {
    icon: Smartphone,
    title: "Reservas por WhatsApp",
    highlight: "+50 mensajes al día",
    description:
      "Los jugadores escriben a cualquier hora y organizar las canchas se vuelve un caos.",
  },
  {
    icon: FileSpreadsheet,
    title: "Rankings en Excel",
    highlight: "Actualizaciones manuales",
    description:
      "Actualizar posiciones consume tiempo y genera errores que nadie detecta a tiempo.",
  },
  {
    icon: GitFork,
    title: "Torneos difíciles de organizar",
    highlight: "Información repartida",
    description:
      "Inscripciones, cuadros y resultados terminan distribuidos entre varias herramientas.",
  },
  {
    icon: Layers,
    title: "Información dispersa",
    highlight: "Sin una única fuente de verdad",
    description:
      "Jugadores, reservas y estadísticas están repartidos entre mensajes, hojas de cálculo y documentos.",
  },
];

function ProblemCard({
  icon: Icon,
  title,
  highlight,
  description,
}: {
  icon: React.ElementType;
  title: string;
  highlight: string;
  description: string;
}) {
  return (
    <div className="group rounded-xl border border-white/10 bg-brand-surface p-6 transition-all duration-300 hover:border-brand-primary/30 hover:bg-brand-surface/80 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10 transition-colors duration-300 group-hover:bg-brand-primary/15">
        <Icon className="h-5 w-5 text-brand-primary" strokeWidth={2} />
      </div>
      <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
      <p className="mb-3 text-xl font-bold text-brand-primary leading-snug">
        {highlight}
      </p>
      <p className="text-sm text-brand-muted leading-relaxed">{description}</p>
    </div>
  );
}

export default function PainPoints() {
  return (
    <section className="border-t border-white/5 bg-brand-bg py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            <span className="text-xs font-medium text-brand-primary tracking-widest uppercase">
              Problemas que resolvemos
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
            ¿Te suena familiar?
          </h2>

          <p className="text-lg text-brand-muted leading-relaxed">
            Muchos clubes de pádel todavía gestionan reservas, rankings y
            torneos con herramientas que no fueron diseñadas para eso.
          </p>
        </div>

        {/* ── Problem cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6 mb-16">
          {problems.map((p) => (
            <ProblemCard key={p.title} {...p} />
          ))}
        </div>

        {/* ── Transition block ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-surface p-8 lg:p-12">
          {/* Glows */}
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[600px] rounded-full bg-brand-primary/6 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-brand-secondary/6 blur-3xl pointer-events-none" />

          <div className="relative">
            {/* Header */}
            <div className="text-center mb-10">
              <h3 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Todo en un solo lugar.
              </h3>
              <p className="text-base text-brand-muted leading-relaxed max-w-lg mx-auto">
                Deja de saltar entre WhatsApp, Excel y múltiples herramientas.
                Gestiona reservas, rankings, torneos y jugadores desde una sola plataforma.
              </p>
            </div>

            {/* Module grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
              {[
                { icon: Calendar,  label: "Reservas", sub: "Gestiona tus canchas",    color: "primary" as const },
                { icon: BarChart2, label: "Rankings",  sub: "Motiva tu comunidad",     color: "secondary" as const },
                { icon: Trophy,    label: "Torneos",   sub: "Organiza competencias",   color: "primary" as const },
                { icon: Users,     label: "Jugadores", sub: "Centraliza tu comunidad", color: "secondary" as const },
              ].map(({ icon: Icon, label, sub, color }) => (
                <div
                  key={label}
                  className="group flex flex-col items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-5 text-center transition-all duration-300 hover:border-white/15 hover:bg-white/6"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-300 ${
                    color === "primary"
                      ? "bg-brand-primary/15 group-hover:bg-brand-primary/20"
                      : "bg-brand-secondary/15 group-hover:bg-brand-secondary/20"
                  }`}>
                    <Icon
                      className={`h-5 w-5 ${color === "primary" ? "text-brand-primary" : "text-brand-secondary"}`}
                      strokeWidth={2}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white mb-0.5">{label}</p>
                    <p className="text-xs text-brand-muted leading-snug">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="text-center">
              <Link
                href="#features"
                className="inline-flex items-center rounded-xl border border-white/20 px-7 py-3.5 text-base font-semibold text-white hover:bg-white/5 transition-colors"
              >
                Ver características →
              </Link>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
