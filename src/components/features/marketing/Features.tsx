import Image from "next/image";
import {
  Calendar,
  BarChart2,
  Trophy,
  Users,
  Check,
  Home,
  ClipboardCheck,
  Newspaper,
  Activity,
  TrendingUp,
  Award,
  History,
  User,
} from "lucide-react";

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
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-surface shadow-2xl shadow-black/50">
      <Image
        src="/img/landing/ranking-real.png"
        alt="Ranking real de MiPadelClub con podio de jugadores, clasificación por categoría y puntos"
        width={1435}
        height={875}
        sizes="(min-width: 1024px) 600px, 100vw"
        className="block h-auto w-full"
      />
    </div>
  );
}


// ─── Mockup: Torneos ──────────────────────────────────────────────────────────
// Refleja el modelo real vigente del módulo (inscripciones por dupla +
// clasificación por puntos, empates genuinos incluidos) — nunca el cuadro
// eliminatorio por partidos/rondas que el producto tuvo en su momento y
// que ya no existe (ver CLAUDE.md → Tournament Module Principles).

function TournamentMockup() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-surface shadow-2xl shadow-black/50">
      <Image
        src="/img/landing/torneos-showcase.png"
        alt="MiPadelClub: gestión de torneos desde el panel del propietario y resultados desde la aplicación móvil del jugador"
        width={1648}
        height={928}
        sizes="(min-width: 1024px) 600px, 100vw"
        className="block h-auto w-full"
      />
    </div>
  );
}


// ─── Mockup: Jugadores ────────────────────────────────────────────────────────


function PlayersMockup() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-surface shadow-2xl shadow-black/50">
      <Image
        src="/img/landing/owner-jugadores.png"
        alt="Gestión real de jugadores en MiPadelClub, con perfiles e información de los miembros del club"
        width={1435}
        height={875}
        sizes="(min-width: 1024px) 600px, 100vw"
        className="block h-auto w-full"
      />
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
      "Historial de puntos por jugador",
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
      "Gestiona inscripciones, duplas y clasificación por puntos desde una sola herramienta — sin repartir información entre distintos chats.",
    benefits: [
      "Inscripción de duplas",
      "Clasificación por puntos, con empates reales",
      "Cierre del torneo con un clic",
      "Puntos aplicados directo al ranking",
    ],
    Mockup: TournamentMockup,
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

// ─── Compact grid tiles ───────────────────────────────────────────────────────
// Mismo patrón visual ya usado en el "module grid" de PainPoints.tsx (icono +
// label + sub-label) — cubre, en formato compacto, las capacidades reales que
// no tienen su propio FeatureBlock arriba, sin inventar una presentación
// nueva para cada una.

interface GridTileDef {
  icon: React.ElementType;
  label: string;
  sub: string;
  color: IconColor;
}

function GridTile({ icon: Icon, label, sub, color }: GridTileDef) {
  return (
    <div className="group flex flex-col items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-5 text-center transition-all duration-300 hover:border-white/15 hover:bg-white/6">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-300 ${
          color === "primary"
            ? "bg-brand-primary/15 group-hover:bg-brand-primary/20"
            : "bg-brand-secondary/15 group-hover:bg-brand-secondary/20"
        }`}
      >
        <Icon className={`h-5 w-5 ${color === "primary" ? "text-brand-primary" : "text-brand-secondary"}`} strokeWidth={2} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-0.5">{label}</p>
        <p className="text-xs text-brand-muted leading-snug">{sub}</p>
      </div>
    </div>
  );
}

// Capacidades reales del propietario/administrador que ya tienen su propio
// FeatureBlock (Reservas, Ranking, Torneos, Jugadores) no se repiten aquí.
const ownerGridItems: GridTileDef[] = [
  { icon: Home, label: "Canchas", sub: "Alta, edición y disponibilidad", color: "primary" },
  { icon: ClipboardCheck, label: "Solicitudes de ingreso", sub: "Aprueba nuevos jugadores", color: "secondary" },
  { icon: Newspaper, label: "Noticias", sub: "Publica novedades del club", color: "primary" },
  { icon: Activity, label: "Estadísticas", sub: "Ocupación y actividad del club", color: "secondary" },
];

const playerGridItems: GridTileDef[] = [
  { icon: Calendar, label: "Reserva de canchas", sub: "Disponibilidad en tiempo real", color: "primary" },
  { icon: TrendingUp, label: "Evolución deportiva", sub: "Puntos y posición a lo largo del tiempo", color: "secondary" },
  { icon: BarChart2, label: "Ranking", sub: "Tu categoría y tu lugar en el club", color: "primary" },
  { icon: Trophy, label: "Torneos", sub: "Inscríbete y sigue tu clasificación", color: "secondary" },
  { icon: Award, label: "Logros deportivos", sub: "Hitos reales de tu propia temporada", color: "primary" },
  { icon: Activity, label: "Estadísticas personales", sub: "Horas jugadas, torneos y podios", color: "secondary" },
  { icon: Newspaper, label: "Noticias del club", sub: "Todo lo que pasa en tu club", color: "primary" },
  { icon: History, label: "Historial deportivo", sub: "Tu actividad, siempre disponible", color: "secondary" },
];

// ─── Diferenciador: perfil deportivo personal ─────────────────────────────────

const profileHighlights = [
  "Categoría",
  "Puntos",
  "Posición en el ranking",
  "Evolución deportiva",
  "Torneos jugados",
  "Logros",
  "Estadísticas personales",
  "Actividad deportiva",
];

function PlayerProfileHighlight() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-surface p-8 lg:p-12">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-brand-primary/6 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-brand-secondary/6 blur-3xl" />

      <div className="relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1.5">
            <User className="h-3.5 w-3.5 text-brand-primary" strokeWidth={2.5} />
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Perfil deportivo</span>
          </div>

          <h3 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            Cada jugador tiene su propio perfil deportivo dentro del club.
          </h3>

          <p className="mb-8 max-w-lg text-base leading-relaxed text-brand-muted">
            No es solo un nombre en una lista. Cada jugador puede consultar, en cualquier momento, cómo va su
            temporada dentro del club.
          </p>

          <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {profileHighlights.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-primary/15">
                  <Check className="h-2.5 w-2.5 text-brand-primary" strokeWidth={3} />
                </div>
                <span className="text-sm text-white/80">{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-center">
          <div className="w-full max-w-[290px] overflow-hidden rounded-[2rem] border border-white/15 bg-brand-surface shadow-2xl shadow-black/50">
            <Image
              src="/img/landing/player-evolucion.png"
              alt="Evolución deportiva del jugador en MiPadelClub, con puntos, ranking y gráfica de progreso"
              width={495}
              height={875}
              sizes="(min-width: 1024px) 290px, 70vw"
              className="block h-auto w-full"
            />
          </div>
        </div>

      </div>
    </div>
  );
}

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
            Una plataforma para el club y para cada jugador.
          </h2>
          <p className="text-lg leading-relaxed text-brand-muted">
            Todo lo que un propietario necesita para operar su club — y todo lo que cada jugador necesita para vivir su temporada.
          </p>
        </div>

        {/* ── Para propietarios ── */}
        <div className="mx-auto mb-14 max-w-2xl text-center lg:mb-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-brand-primary">Para propietarios</span>
          </div>
          <h3 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Todo el control de tu club en un solo lugar
          </h3>
          <p className="text-base leading-relaxed text-brand-muted">
            Deja de saltar entre WhatsApp, Excel y varias herramientas — administra tu club desde una sola plataforma.
          </p>
        </div>

        <div className="space-y-0">
          {featureDefs.map((def, i) => (
            <div key={def.tag}>
              {i > 0 && <div className="my-20 border-t border-white/5 lg:my-28" />}
              <FeatureBlock def={def} />
            </div>
          ))}
        </div>

        <div className="mt-20 grid grid-cols-2 gap-3 lg:mt-28 lg:grid-cols-4">
          {ownerGridItems.map((item) => (
            <GridTile key={item.label} {...item} />
          ))}
        </div>

        <div className="my-20 border-t border-white/5 lg:my-28" />

        {/* ── Para jugadores ── */}
        <div className="mx-auto mb-14 max-w-2xl text-center lg:mb-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-secondary/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" />
            <span className="text-xs font-medium uppercase tracking-widest text-brand-secondary">Para jugadores</span>
          </div>
          <h3 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Una experiencia que hace que quieran volver cada semana
          </h3>
          <p className="text-base leading-relaxed text-brand-muted">
            No solo reservan una cancha — siguen su propia evolución dentro del club.
          </p>
        </div>

        <div className="mb-16 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {playerGridItems.map((item) => (
            <GridTile key={item.label} {...item} />
          ))}
        </div>

        <PlayerProfileHighlight />

      </div>
    </section>
  );
}
