import Link from "next/link";
import { Calendar, BarChart2, Trophy, Users } from "lucide-react";

// ─── Mockup cards ────────────────────────────────────────────────────────────

function CardHeader({
  icon: Icon,
  label,
  color = "primary",
}: {
  icon: React.ElementType;
  label: string;
  color?: "primary" | "secondary";
}) {
  const bg =
    color === "primary" ? "bg-brand-primary/15" : "bg-brand-secondary/15";
  const fg =
    color === "primary" ? "text-brand-primary" : "text-brand-secondary";
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${bg}`}
      >
        <Icon className={`h-3.5 w-3.5 ${fg}`} strokeWidth={2.5} />
      </div>
      <p className="text-xs font-semibold text-white">{label}</p>
    </div>
  );
}

function ReservasCard() {
  const slots = [
    { court: "Cancha 1", time: "18:00" },
    { court: "Cancha 2", time: "19:00" },
    { court: "Cancha 3", time: "20:00" },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-brand-surface p-4 shadow-2xl shadow-black/40">
      <CardHeader icon={Calendar} label="Reservas de hoy" />
      <div className="space-y-1.5">
        {slots.map((s) => (
          <div
            key={s.court}
            className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5"
          >
            <span className="text-xs text-brand-muted">{s.court}</span>
            <span className="text-xs font-semibold text-white">{s.time}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
        <p className="text-xs font-medium text-brand-primary">12 reservas hoy</p>
      </div>
    </div>
  );
}

function RankingCard() {
  const players = [
    { pos: 1, name: "Alejandro M.", pts: 850 },
    { pos: 2, name: "Carlos R.", pts: 720 },
    { pos: 3, name: "Miguel P.", pts: 680 },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm p-4 shadow-xl shadow-black/30">
      <CardHeader icon={BarChart2} label="Ranking General" color="secondary" />
      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.pos} className="flex items-center gap-2">
            <span
              className={`w-3.5 text-[10px] font-bold text-center shrink-0 ${
                p.pos === 1 ? "text-brand-primary" : "text-brand-muted"
              }`}
            >
              {p.pos}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-secondary/20">
              <span className="text-[9px] font-semibold text-brand-secondary">
                {p.name.charAt(0)}
              </span>
            </div>
            <span className="flex-1 text-xs text-white truncate">{p.name}</span>
            <span className="text-[10px] font-semibold text-brand-primary shrink-0">
              {p.pts}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JugadoresCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-brand-bg/90 backdrop-blur-sm p-4 shadow-xl shadow-black/30">
      <CardHeader icon={Users} label="Jugadores activos" color="secondary" />
      <p className="text-3xl font-bold text-white leading-none">186</p>
      <p className="mt-1.5 text-xs text-brand-secondary font-medium">
        +14 este mes
      </p>
    </div>
  );
}

function TorneoCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm p-4 shadow-xl shadow-black/30">
      <CardHeader icon={Trophy} label="Torneo Primavera" />
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-brand-muted">Jugadores</span>
          <span className="text-xs font-semibold text-white">32</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-brand-muted">Fase</span>
          <span className="text-xs font-semibold text-white">Octavos</span>
        </div>
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/15 px-2.5 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
        <span className="text-xs font-medium text-brand-primary">En progreso</span>
      </div>
    </div>
  );
}

function ProductMockup() {
  return (
    <div className="relative select-none w-full">
      {/* Ambient glow */}
      <div className="absolute -inset-8 rounded-3xl bg-brand-secondary/8 blur-3xl pointer-events-none" />

      {/* 2-column card grid — right column offset down for diagonal depth */}
      <div className="relative grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">
          <ReservasCard />
          <RankingCard />
        </div>
        <div className="flex flex-col gap-3 pt-10">
          <JugadoresCard />
          <TorneoCard />
        </div>
      </div>
    </div>
  );
}

// ─── Feature highlights ───────────────────────────────────────────────────────

const highlights = [
  { icon: Calendar, label: "Reservas", sub: "Gestiona tus canchas" },
  { icon: BarChart2, label: "Rankings", sub: "Motiva tu comunidad" },
  { icon: Trophy, label: "Torneos", sub: "Organiza competencias" },
];

// ─── Hero ─────────────────────────────────────────────────────────────────────

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 lg:pt-20 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-1/3 -left-72 w-[700px] h-[700px] rounded-full bg-brand-secondary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-72 w-[600px] h-[600px] rounded-full bg-brand-primary/5 blur-3xl pointer-events-none" />

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
        <div className="grid lg:grid-cols-[3fr_2fr] gap-14 lg:gap-16 items-center">

          {/* ── Copy ── */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
              <span className="text-xs font-medium text-brand-primary tracking-widest uppercase">
                Para dueños y administradores de clubes de pádel
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-[3.5rem] font-bold leading-[1.06] tracking-tight text-white">
              Más pádel.
              <br />
              <span className="text-brand-primary">Menos administración.</span>
            </h1>

            {/* Subheadline */}
            <p className="mt-6 text-lg text-brand-muted leading-relaxed max-w-[420px]">
              Gestiona reservas, rankings, torneos y jugadores desde una sola
              plataforma diseñada para clubes de pádel.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="https://wa.me/573173672033?text=Hola%2C%20quiero%20conocer%20m%C3%A1s%20sobre%20PadelClub%20para%20mi%20club%20de%20p%C3%A1del."
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-brand-primary px-7 py-3.5 text-base font-semibold text-brand-bg hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/20"
              >
                Hablar por WhatsApp
              </a>
              <Link
                href="#features"
                className="rounded-xl border border-white/20 px-7 py-3.5 text-base font-semibold text-white hover:bg-white/5 transition-colors"
              >
                Ver características →
              </Link>
            </div>

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

          {/* ── Mockup ── */}
          <div className="hidden lg:flex items-center justify-center">
            <div className="w-full max-w-xs xl:max-w-sm">
              <ProductMockup />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
