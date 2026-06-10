import Link from "next/link";
import { Calendar, BarChart2, Trophy, Users, Check } from "lucide-react";

// ─── Mockup: Reservas ─────────────────────────────────────────────────────────

function CalendarMockup() {
  const dayLabels = ["L", "M", "X", "J", "V", "S", "D"];
  // June 2026 starts on Monday — perfect alignment
  const dates: (number | null)[] = [
    1, 2, 3, 4, 5, 6, 7,
    8, 9, 10, 11, 12, 13, 14,
    15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28,
    29, 30, null, null, null, null, null,
  ];
  const bookedDates = [2, 5, 6, 11, 13, 16, 17, 20, 23, 26];
  const todayDate = 10;

  const slots = [
    { court: "Cancha 1", time: "08:00", player: "Carlos R." },
    { court: "Cancha 2", time: "10:00", player: "Miguel P." },
    { court: "Cancha 3", time: "18:00", player: "Alejandro M." },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 shadow-2xl shadow-black/50 select-none">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-brand-muted">Calendario</p>
          <p className="text-sm font-bold text-white">Junio 2026</p>
        </div>
        <div className="flex gap-1">
          {["‹", "›"].map((ch) => (
            <div key={ch} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
              <span className="text-xs text-brand-muted">{ch}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day labels */}
      <div className="mb-1 grid grid-cols-7">
        {dayLabels.map((d) => (
          <div key={d} className="flex h-6 items-center justify-center text-[10px] font-semibold text-brand-muted">
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="mb-4 grid grid-cols-7 gap-0.5">
        {dates.map((d, i) => (
          <div
            key={i}
            className={[
              "flex h-7 items-center justify-center rounded-md text-[11px] font-medium",
              d === null ? "" :
              d === todayDate ? "bg-brand-primary font-bold text-brand-bg" :
              bookedDates.includes(d) ? "bg-brand-secondary/15 text-brand-secondary" :
              "text-brand-muted",
            ].join(" ")}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Today's slots */}
      <div className="border-t border-white/8 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-brand-muted">
          Hoy · 3 reservas
        </p>
        <div className="space-y-1.5">
          {slots.map((s) => (
            <div key={s.court} className="flex items-center gap-2 rounded-lg bg-white/4 px-3 py-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
              <span className="flex-1 truncate text-[11px] font-medium text-white">{s.court}</span>
              <span className="shrink-0 text-[10px] text-brand-muted">{s.time}</span>
              <span className="shrink-0 text-[10px] text-brand-secondary">{s.player}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mockup: Rankings ─────────────────────────────────────────────────────────

function RankingMockup() {
  const players = [
    { pos: 1, name: "Alejandro M.", cat: "A", pts: 850, delta: "+12", trend: "up" },
    { pos: 2, name: "Carlos R.", cat: "A", pts: 720, delta: "+5", trend: "up" },
    { pos: 3, name: "Miguel P.", cat: "B", pts: 680, delta: "–", trend: "same" },
    { pos: 4, name: "Roberto S.", cat: "B", pts: 640, delta: "+8", trend: "up" },
    { pos: 5, name: "Daniel L.", cat: "B", pts: 590, delta: "-3", trend: "down" },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 shadow-2xl shadow-black/50 select-none">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-brand-muted">Rankings</p>
          <p className="text-sm font-bold text-white">Clasificación General</p>
        </div>
        <div className="rounded-lg bg-brand-primary/15 px-2.5 py-1">
          <span className="text-xs font-semibold text-brand-primary">Temporada 2026</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {players.map((p) => (
          <div
            key={p.pos}
            className={[
              "flex items-center gap-3 rounded-lg px-3 py-2",
              p.pos === 1 ? "bg-brand-primary/10" : "bg-white/3",
            ].join(" ")}
          >
            <span className={`w-4 shrink-0 text-center text-xs font-bold ${p.pos === 1 ? "text-brand-primary" : "text-brand-muted"}`}>
              {p.pos}
            </span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-secondary/20">
              <span className="text-[10px] font-bold text-brand-secondary">{p.name[0]}</span>
            </div>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{p.name}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${p.cat === "A" ? "bg-brand-primary/15 text-brand-primary" : "bg-white/8 text-brand-muted"}`}>
              {p.cat}
            </span>
            <span className={`shrink-0 text-[10px] font-medium ${p.trend === "up" ? "text-brand-primary" : p.trend === "down" ? "text-red-400" : "text-brand-muted"}`}>
              {p.delta}
            </span>
            <span className="w-9 shrink-0 text-right text-xs font-bold text-white">{p.pts}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
        <span className="text-[10px] text-brand-muted">42 jugadores clasificados</span>
        <span className="text-[10px] font-medium text-brand-secondary">Actualizado automáticamente</span>
      </div>
    </div>
  );
}

// ─── Mockup: Torneos ──────────────────────────────────────────────────────────

function MatchBox({
  a,
  b,
  winnerA,
  state,
}: {
  a: string;
  b: string;
  winnerA?: boolean;
  state: "done" | "active" | "pending";
}) {
  return (
    <div
      className={[
        "rounded-lg border p-1.5",
        state === "done" ? "border-white/8 bg-white/3" :
        state === "active" ? "border-brand-secondary/25 bg-brand-secondary/5" :
        "border-brand-primary/25 bg-brand-primary/5",
      ].join(" ")}
    >
      <div className={`rounded px-1.5 py-[3px] text-[10px] ${winnerA === true ? "font-semibold text-white" : winnerA === false ? "text-brand-muted" : "text-brand-muted"}`}>
        {a}
      </div>
      <div className="my-0.5 h-px bg-white/8" />
      <div className={`rounded px-1.5 py-[3px] text-[10px] ${winnerA === false ? "font-semibold text-white" : winnerA === true ? "text-brand-muted" : "text-brand-muted"}`}>
        {b}
      </div>
    </div>
  );
}

function BracketMockup() {
  return (
    <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 shadow-2xl shadow-black/50 select-none">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-brand-muted">Torneos</p>
          <p className="text-sm font-bold text-white">Torneo Primavera 2026</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/15 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
          <span className="text-xs font-medium text-brand-primary">En progreso</span>
        </div>
      </div>

      {/* Bracket columns */}
      <div className="flex items-start gap-2">
        {/* Cuartos */}
        <div className="flex flex-1 flex-col gap-1.5">
          <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-brand-muted">Cuartos</p>
          <MatchBox a="Alejandro M." b="Roberto S." winnerA={true} state="done" />
          <MatchBox a="Carlos R." b="Daniel L." winnerA={true} state="done" />
          <MatchBox a="Miguel P." b="Fernando G." winnerA={true} state="done" />
          <MatchBox a="Pablo V." b="Javier M." winnerA={false} state="done" />
        </div>

        <div className="mt-14 text-[10px] text-brand-muted/30">›</div>

        {/* Semis */}
        <div className="flex flex-1 flex-col">
          <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-brand-muted">Semis</p>
          <MatchBox a="Alejandro M." b="Carlos R." state="active" />
          <div className="h-[calc(theme(height.9)+theme(spacing.6))]" />
          <MatchBox a="Miguel P." b="Javier M." state="active" />
        </div>

        <div className="mt-16 text-[10px] text-brand-muted/30">›</div>

        {/* Final */}
        <div className="flex flex-1 flex-col mt-[3.25rem]">
          <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-brand-primary">Final</p>
          <MatchBox a="Por definir" b="Por definir" state="pending" />
        </div>
      </div>

      <div className="mt-4 flex gap-4 border-t border-white/8 pt-3">
        <div>
          <p className="text-[10px] text-brand-muted">Participantes</p>
          <p className="text-sm font-bold text-white">32</p>
        </div>
        <div>
          <p className="text-[10px] text-brand-muted">Fase actual</p>
          <p className="text-sm font-bold text-white">Cuartos</p>
        </div>
        <div>
          <p className="text-[10px] text-brand-muted">Estado</p>
          <p className="text-sm font-bold text-brand-primary">Activo</p>
        </div>
      </div>
    </div>
  );
}

// ─── Mockup: Jugadores ────────────────────────────────────────────────────────

function PlayersMockup() {
  const players = [
    { name: "Alejandro M.", rank: 1, cat: "A", games: 24, wins: 18 },
    { name: "Carlos R.", rank: 2, cat: "A", games: 20, wins: 14 },
    { name: "Miguel P.", rank: 3, cat: "B", games: 18, wins: 11 },
    { name: "Roberto S.", rank: 4, cat: "B", games: 16, wins: 9 },
  ];
  const initials = ["A", "C", "M", "R", "D"];

  return (
    <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 shadow-2xl shadow-black/50 select-none">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-brand-muted">Jugadores</p>
          <p className="text-sm font-bold text-white">Comunidad del Club</p>
        </div>
        <div className="rounded-lg bg-brand-secondary/15 px-2.5 py-1">
          <span className="text-xs font-semibold text-brand-secondary">186 activos</span>
        </div>
      </div>

      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.rank} className="flex items-center gap-3 rounded-xl bg-white/3 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-brand-secondary/30 to-brand-primary/20">
              <span className="text-sm font-bold text-white">{p.name[0]}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{p.name}</p>
              <p className="text-[10px] text-brand-muted">#{p.rank} · Cat. {p.cat}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-white">{p.wins}<span className="text-brand-muted font-normal">/{p.games}</span></p>
              <p className="text-[10px] text-brand-muted">victorias</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
        <span className="text-[10px] text-brand-muted">+14 nuevos este mes</span>
        <div className="flex -space-x-1.5">
          {initials.map((ch, i) => (
            <div key={i} className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-surface bg-brand-secondary/30">
              <span className="text-[7px] font-bold text-brand-secondary">{ch}</span>
            </div>
          ))}
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-surface bg-white/10">
            <span className="text-[7px] text-brand-muted">+</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Feature data ─────────────────────────────────────────────────────────────

type IconColor = "primary" | "secondary";

interface FeatureDef {
  icon: React.ElementType;
  tag: string;
  iconColor: IconColor;
  title: string;
  description: string;
  benefits: string[];
  Mockup: React.ElementType;
  flip: boolean;
}

const featureDefs: FeatureDef[] = [
  {
    icon: Calendar,
    tag: "Reservas",
    iconColor: "primary",
    title: "Reservas inteligentes",
    description:
      "Controla la disponibilidad de tus canchas desde un único calendario y evita la gestión manual por WhatsApp.",
    benefits: [
      "Calendario de reservas",
      "Disponibilidad en tiempo real",
      "Historial de reservas",
      "Gestión centralizada de canchas",
    ],
    Mockup: CalendarMockup,
    flip: false,
  },
  {
    icon: BarChart2,
    tag: "Rankings",
    iconColor: "secondary",
    title: "Rankings que motivan a tu comunidad",
    description:
      "Mantén a los jugadores comprometidos con rankings actualizados y estadísticas siempre disponibles.",
    benefits: [
      "Rankings automáticos",
      "Estadísticas de jugadores",
      "Clasificaciones por categorías",
      "Historial de resultados",
    ],
    Mockup: RankingMockup,
    flip: true,
  },
  {
    icon: Trophy,
    tag: "Torneos",
    iconColor: "primary",
    title: "Organiza torneos sin complicaciones",
    description:
      "Gestiona inscripciones, cuadros y resultados desde una sola herramienta.",
    benefits: [
      "Registro de participantes",
      "Cuadros de competición",
      "Seguimiento de resultados",
      "Estado del torneo en tiempo real",
    ],
    Mockup: BracketMockup,
    flip: false,
  },
  {
    icon: Users,
    tag: "Jugadores",
    iconColor: "secondary",
    title: "Gestiona tu comunidad de jugadores",
    description:
      "Centraliza la información de todos los jugadores de tu club en un único lugar.",
    benefits: [
      "Perfiles de jugadores",
      "Historial de actividad",
      "Participación en torneos",
      "Información organizada",
    ],
    Mockup: PlayersMockup,
    flip: true,
  },
];

// ─── Feature block ────────────────────────────────────────────────────────────

function FeatureBlock({ def }: { def: FeatureDef }) {
  const { icon: Icon, tag, iconColor, title, description, benefits, Mockup, flip } = def;

  const tagBg = iconColor === "primary" ? "bg-brand-primary/10" : "bg-brand-secondary/10";
  const tagFg = iconColor === "primary" ? "text-brand-primary" : "text-brand-secondary";
  const glowBg = iconColor === "primary" ? "bg-brand-primary/8" : "bg-brand-secondary/8";

  return (
    <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
      {/* Text */}
      <div className={`scroll-fade ${flip ? "lg:order-2" : ""}`}>
        <div className={`mb-5 inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 ${tagBg}`}>
          <Icon className={`h-3.5 w-3.5 ${tagFg}`} strokeWidth={2.5} />
          <span className={`text-xs font-semibold uppercase tracking-wider ${tagFg}`}>{tag}</span>
        </div>

        <h3 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
          {title}
        </h3>

        <p className="mb-8 max-w-lg text-base leading-relaxed text-brand-muted">
          {description}
        </p>

        <ul className="space-y-3">
          {benefits.map((b) => (
            <li key={b} className="flex items-center gap-3">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/15">
                <Check className="h-3 w-3 text-brand-primary" strokeWidth={3} />
              </div>
              <span className="text-sm font-medium text-white">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Mockup */}
      <div className={`scroll-fade ${flip ? "lg:order-1" : ""}`}>
        <div className="relative">
          <div className={`pointer-events-none absolute -inset-8 rounded-3xl blur-3xl ${glowBg}`} />
          <div className="relative">
            <Mockup />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Features section ─────────────────────────────────────────────────────────

export default function Features() {
  return (
    <section className="border-t border-white/5 bg-brand-bg py-24 lg:py-32" id="features">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mx-auto mb-20 max-w-2xl text-center lg:mb-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-brand-primary">
              Funcionalidades
            </span>
          </div>
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Todo lo que necesitas para gestionar tu club.
          </h2>
          <p className="text-lg leading-relaxed text-brand-muted">
            Desde reservas y rankings hasta torneos y jugadores. Todo conectado en una única plataforma.
          </p>
        </div>

        {/* Feature blocks */}
        <div className="space-y-0">
          {featureDefs.map((def, i) => (
            <div key={def.tag}>
              {i > 0 && <div className="my-20 border-t border-white/5 lg:my-28" />}
              <FeatureBlock def={def} />
            </div>
          ))}
        </div>

        {/* Closing CTA */}
        <div className="relative mt-20 overflow-hidden rounded-3xl border border-white/10 bg-brand-surface p-10 text-center lg:mt-28 lg:p-16">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-primary/5 via-transparent to-brand-secondary/5" />
          <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[500px] -translate-x-1/2 rounded-full bg-brand-primary/8 blur-3xl" />

          <div className="relative">
            <h3 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Menos herramientas.
              <br />
              Más control.
            </h3>
            <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-brand-muted">
              PadelClub reúne todo lo que necesitas para gestionar tu club en una sola plataforma diseñada específicamente para pádel.
            </p>
            <a
              href="https://wa.me/573173672033?text=Hola%2C%20quiero%20conocer%20m%C3%A1s%20sobre%20PadelClub%20para%20mi%20club%20de%20p%C3%A1del."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl bg-brand-primary px-8 py-4 text-base font-semibold text-brand-bg shadow-lg shadow-brand-primary/20 transition-colors hover:bg-brand-primary/90"
            >
              Hablar por WhatsApp
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
