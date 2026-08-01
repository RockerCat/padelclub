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
  const players = [
    { pos: 1, name: "Alejandro M.", pts: 850, delta: "+12", trend: "up" },
    { pos: 2, name: "Carlos R.", pts: 720, delta: "+5", trend: "up" },
    { pos: 3, name: "Miguel P.", pts: 680, delta: "–", trend: "same" },
    { pos: 4, name: "Roberto S.", pts: 640, delta: "+8", trend: "up" },
    { pos: 5, name: "Daniel L.", pts: 590, delta: "-3", trend: "down" },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 shadow-2xl shadow-black/50 select-none">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-brand-muted">Ranking</p>
          <p className="text-sm font-bold text-white">Categoría 1a</p>
        </div>
        <div className="rounded-lg bg-brand-primary/15 px-2.5 py-1">
          <span className="text-xs font-semibold text-brand-primary">Ciclo vigente</span>
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
            <span className={`shrink-0 text-[10px] font-medium ${p.trend === "up" ? "text-brand-primary" : p.trend === "down" ? "text-red-400" : "text-brand-muted"}`}>
              {p.delta}
            </span>
            <span className="w-9 shrink-0 text-right text-xs font-bold text-white">{p.pts}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
        <span className="text-[10px] text-brand-muted">42 jugadores en esta categoría</span>
        <span className="text-[10px] font-medium text-brand-secondary">Se actualiza al registrar resultados</span>
      </div>
    </div>
  );
}

// ─── Mockup: Torneos ──────────────────────────────────────────────────────────
// Refleja el modelo real vigente del módulo (inscripciones por dupla +
// clasificación por puntos, empates genuinos incluidos) — nunca el cuadro
// eliminatorio por partidos/rondas que el producto tuvo en su momento y
// que ya no existe (ver CLAUDE.md → Tournament Module Principles).

function ClassificationRow({ pos, pair, pts, highlight }: { pos: number; pair: string; pts: number; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${highlight ? "bg-brand-primary/10" : "bg-white/3"}`}>
      <span className={`w-4 shrink-0 text-center text-xs font-bold ${highlight ? "text-brand-primary" : "text-brand-muted"}`}>
        {pos}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{pair}</span>
      <span className="shrink-0 text-xs font-bold text-white">{pts} <span className="font-normal text-brand-muted">pts</span></span>
    </div>
  );
}

function TournamentMockup() {
  return (
    <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 shadow-2xl shadow-black/50 select-none">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-brand-muted">Torneos</p>
          <p className="text-sm font-bold text-white">Torneo Primavera 2026</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/15 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
          <span className="text-xs font-medium text-brand-primary">Inscripciones abiertas</span>
        </div>
      </div>

      {/* Clasificación por puntos — empate real en el 1er lugar, honesto */}
      <div className="space-y-1.5">
        <ClassificationRow pos={1} pair="Alejandro M. / Carlos R." pts={24} highlight />
        <ClassificationRow pos={1} pair="Miguel P. / Roberto S." pts={24} highlight />
        <ClassificationRow pos={3} pair="Daniel L. / Fernando G." pts={18} />
        <ClassificationRow pos={4} pair="Pablo V. / Javier M." pts={12} />
      </div>

      <div className="mt-4 flex gap-4 border-t border-white/8 pt-3">
        <div>
          <p className="text-[10px] text-brand-muted">Duplas confirmadas</p>
          <p className="text-sm font-bold text-white">14/16</p>
        </div>
        <div>
          <p className="text-[10px] text-brand-muted">Categoría</p>
          <p className="text-sm font-bold text-white">4a</p>
        </div>
        <div>
          <p className="text-[10px] text-brand-muted">Estado</p>
          <p className="text-sm font-bold text-brand-primary">Abierto</p>
        </div>
      </div>
    </div>
  );
}

// ─── Mockup: Jugadores ────────────────────────────────────────────────────────

function PlayersMockup() {
  const players = [
    { name: "Alejandro M.", rank: 1, cat: "1a", pts: 850 },
    { name: "Carlos R.", rank: 2, cat: "1a", pts: 720 },
    { name: "Miguel P.", rank: 3, cat: "2a", pts: 680 },
    { name: "Roberto S.", rank: 4, cat: "2a", pts: 640 },
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
              <p className="text-xs font-bold text-white">{p.pts}</p>
              <p className="text-[10px] text-brand-muted">puntos</p>
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

function PlayerProfileMockup() {
  return (
    <div className="mx-auto max-w-sm select-none rounded-2xl border border-white/10 bg-brand-bg/90 p-5 shadow-2xl shadow-black/50 backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-brand-secondary/30 to-brand-primary/20">
          <span className="text-base font-bold text-white">A</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">Alejandro M.</p>
          <p className="text-xs text-brand-muted">Categoría 1a · #2 del ranking</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/5 px-2 py-2.5 text-center">
          <p className="text-lg font-bold leading-none text-brand-primary">720</p>
          <p className="mt-1 text-[10px] text-brand-muted">puntos</p>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-2.5 text-center">
          <p className="text-lg font-bold leading-none text-white">5</p>
          <p className="mt-1 text-[10px] text-brand-muted">torneos</p>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-2.5 text-center">
          <p className="text-lg font-bold leading-none text-white">2</p>
          <p className="mt-1 text-[10px] text-brand-muted">podios</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 rounded-lg bg-brand-primary/10 px-3 py-2">
        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
        <span className="text-xs font-medium text-brand-primary">Subió 3 posiciones este mes</span>
      </div>
    </div>
  );
}

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

        <div>
          <PlayerProfileMockup />
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
