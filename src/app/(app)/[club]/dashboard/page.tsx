import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Users,
  Home,
  Settings,
  AlertTriangle,
  Shield,
  Share2,
  CalendarClock,
  CalendarRange,
  Flame,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_OPERATING_HOURS,
  DAY_NAMES,
  computeAvailableMinutesForRange,
  type OperatingHour,
} from "@/lib/operatingHours";
import { DashboardTabs } from "./DashboardTabs";
import { resolveDashboardTab } from "./dashboardTabsConfig";
import { OnboardingWizard } from "./OnboardingWizard";
import { getRecentActivity } from "./activity";
import { ActivityFeed } from "./ActivityFeed";
import { clubHubPath } from "@/lib/clubHubPaths";
import { ClubHero } from "@/components/clubs/ClubHero";
import { CourtIllustration, getSurfaceLabel } from "@/components/courts/CourtIllustration";
import { WeekdayOccupancyChart } from "./WeekdayOccupancyChart";
import type { Court } from "@/types/database";
import { CourtsGrid } from "../admin/courts/CourtsGrid";
import { CreateCourtButton } from "../admin/courts/CreateCourtButton";
import { resolveCourtsStatusFilter } from "./courtsStatusFilterConfig";
import { CourtsStatusFilter } from "./CourtsStatusFilter";
import { getClubStatistics } from "@/lib/clubStatistics";
import { resolveStatsPeriodKey, resolveStatsPeriod } from "@/lib/clubStatisticsRange";
import { PeriodSelector } from "../admin/statistics/PeriodSelector";
import { StatsKpiGrid } from "../admin/statistics/StatsKpiGrid";
import { TimelineChart } from "../admin/statistics/TimelineChart";
import { StatusDistributionChart } from "../admin/statistics/StatusDistributionChart";
import { CourtUsageList } from "../admin/statistics/CourtUsageList";
import { WeekdayActivityChart } from "../admin/statistics/WeekdayActivityChart";
import { HourlySlotsChart } from "../admin/statistics/HourlySlotsChart";
import { loadPlayerDashboardData } from "./player/loadPlayerDashboardData";
import { PlayerDashboardView } from "./player/PlayerDashboardView";

interface DashboardPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// ─── Semantic color rule ────────────────────────────────────────────────────
// Fixed meaning, never magnitude: rojo only for something negative/critical
// (cancelaciones, rechazos, alertas reales), amarillo only for pendiente
// (esperando confirmación), verde only for un resultado positivo alcanzado
// (confirmadas, cupo completo), y cyan (la marca de Mi Pádel Club, no el
// color configurable del club — ver src/lib/constants/clubTheme.ts, ya no
// existe personalización por club) para todo lo meramente descriptivo:
// ocupación, horas reservadas, uso de cancha, evolución. Un 12% de
// ocupación no es "malo" y un 90% no es "bueno" por sí solos — nunca se
// deriva un color de un porcentaje.
const NEUTRAL_METRIC_COLOR = "var(--club-primary, #00ffff)";

// ─── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function formatHours(minutes: number): string {
  if (minutes === 0) return "0";
  const h = minutes / 60;
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}

function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type UpcomingRow = {
  id: string;
  court_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  reservation_players: Array<{ profiles: { full_name: string | null } | null }>;
};

// ─── KPI card sub-component ───────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit,
  sub,
  Icon,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  Icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="relative bg-brand-surface border border-white/10 rounded-2xl p-5 overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: color, opacity: 0.8 }}
      />
      <Icon className="absolute right-4 bottom-4 w-14 h-14 text-white opacity-[0.04]" />
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
        }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs text-brand-muted mb-1 leading-tight">{label}</p>
      <p className="leading-none mb-1" style={{ color }}>
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        {unit && (
          <span className="text-xl font-semibold ml-0.5">{unit}</span>
        )}
      </p>
      {sub && <p className="text-[11px] text-brand-muted/70">{sub}</p>}
    </div>
  );
}

// Small stacked stat used inside the "Operación próxima" cards, which each
// show several stats at once (unlike KpiCard, which is built for exactly one).
function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-bold text-white tabular-nums leading-tight">{value}</p>
      <p className="text-[11px] text-brand-muted">{label}</p>
    </div>
  );
}

// Section wrapper shared by the Rendimiento view's cards — mirrors the
// standalone Estadísticas screen's own SectionCard exactly (moved here
// verbatim, that page now only redirects).
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 sm:p-5">
      <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1">{title}</h2>
      {subtitle && <p className="text-[11px] text-brand-muted/70 mb-3">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-4"}>{children}</div>
    </div>
  );
}

// Per-court occupancy card grid — used by "Proyección por cancha" (Operación).
type CourtOccupancyItem = {
  id: string;
  name: string;
  surface: string | null;
  pct: number;
  color: string;
  nextSlot: { startTime: string; endTime: string; playerName: string } | null;
};

function CourtOccupancyGrid({
  items,
  pctCaption,
  emptyLabel = "Sin canchas activas",
  noSlotLabel = "Sin reservas programadas",
}: {
  items: CourtOccupancyItem[];
  pctCaption: string;
  emptyLabel?: string;
  noSlotLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-brand-muted">{emptyLabel}</p>;
  }

  // 1 cancha → 1 columna · número par → 2 columnas · número impar (>1) → 3 columnas
  const columnCount = items.length === 1 ? 1 : items.length % 2 === 0 ? 2 : 3;
  const gridClass =
    columnCount === 1
      ? "grid-cols-1"
      : columnCount === 2
      ? "grid-cols-1 lg:grid-cols-2"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid ${gridClass} gap-4`}>
      {items.map((c) => (
        // @container: the illustration/content split below reacts to this
        // card's own rendered width, not the viewport — the same card is
        // narrower with 3 per row than with 1, on the exact same screen.
        // Content always wins: the illustration column is a percentage
        // (shrinks first as the card narrows) with a floor so it never
        // disappears, never a fixed px width that starves the content
        // column at higher column counts.
        <div
          key={c.id}
          className="@container bg-brand-surface border border-white/10 rounded-2xl p-4 grid grid-cols-1 gap-4 @sm:grid-cols-[minmax(84px,28%)_1fr] @sm:gap-x-4 @sm:gap-y-0"
        >
          {/* Nombre, superficie, % ocupación, barra — angosto: 1º · ancho: columna derecha, fila 1 */}
          <div className="min-w-0 flex flex-col justify-center @sm:col-start-2 @sm:row-start-1">
            <p className="text-base font-semibold text-white uppercase tracking-wide break-words @sm:truncate">
              {c.name}
            </p>
            <p className="text-xs text-brand-muted/60 mt-0.5">{getSurfaceLabel(c.surface)}</p>

            <div className="mt-3">
              <span
                className="text-3xl font-bold tabular-nums leading-none"
                style={{ color: c.color }}
              >
                {c.pct}%
              </span>
              <p className="text-[11px] text-brand-muted mt-1 mb-1.5">{pctCaption}</p>
              <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${c.pct}%`, backgroundColor: c.color }}
                />
              </div>
            </div>
          </div>

          {/* Ilustración — angosto: 2º, ancho completo con tope · ancho: columna izquierda, ambas filas */}
          <div className="relative w-full max-w-[240px] mx-auto shrink-0 @sm:mx-0 @sm:max-w-none @sm:col-start-1 @sm:row-start-1 @sm:row-span-2 @sm:self-center">
            <div className="absolute top-1 left-1 z-10 flex gap-1.5" />
            <CourtIllustration surface={c.surface} className="w-full" />
          </div>

          {/* Próximo turno — angosto: 3º · ancho: columna derecha, fila 2 */}
          <div className="min-w-0 pt-3 border-t border-white/[0.06] @sm:col-start-2 @sm:row-start-2">
            <p className="text-[11px] text-brand-muted mb-1">Próximo turno:</p>
            {c.nextSlot ? (
              <div className="flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: c.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight whitespace-nowrap">
                    {c.nextSlot.startTime} - {c.nextSlot.endTime}
                  </p>
                  <p className="text-sm font-semibold text-white leading-tight line-clamp-2">
                    {c.nextSlot.playerName}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-brand-muted/70">{noSlotLabel}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const { club: slug } = await params;
  const resolvedSearchParams = await searchParams;
  const activeTab = resolveDashboardTab(
    typeof resolvedSearchParams.tab === "string" ? resolvedSearchParams.tab : undefined
  );
  const periodParam =
    typeof resolvedSearchParams.period === "string" ? resolvedSearchParams.period : undefined;
  const courtsStatusFilter = resolveCourtsStatusFilter(
    typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : undefined
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, slug, name, description, city, state, country, address, latitude, longitude, logo_url, cover_image_url, visibility, whatsapp, instagram, facebook, youtube, allowed_reservation_durations")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!club) notFound();

  const { data: membership } = await supabase
    .from("club_members")
    .select("id, role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();
  if (!membership) redirect("/unauthorized");

  // PLAYER gets its own personal sport Dashboard at this exact same URL
  // (see getClubEntryPath) — a totally different composition/view, never a
  // reduced copy of the OWNER/ADMIN operational dashboard below. Nothing
  // past this branch (queries, tabs, KPIs) ever runs for a PLAYER.
  if (membership.role === "PLAYER") {
    const todayStrForPlayer = toDateStr(new Date());
    const data = await loadPlayerDashboardData(
      supabase,
      club.id,
      slug,
      membership.id,
      user.id,
      user.email ?? null,
      todayStrForPlayer
    );
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <PlayerDashboardView clubSlug={slug} clubName={club.name} {...data} />
      </div>
    );
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") redirect(`/${slug}`);

  // ─── Date ranges ─────────────────────────────────────────────────────────────
  const now = new Date();
  const nowTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  // ─── Baseline fetches — needed on every view (onboarding banner, empty
  // state, "Canchas" KPI) regardless of which tab is active ───────────────────
  const [courtsRes, operatingHoursRes, hasAnyReservationRes, playerCountRes, adminCountRes] =
    await Promise.all([
      // Active courts — id/name/surface, used by onboarding step4 and by the
      // Operación view's per-court breakdown.
      supabase
        .from("courts")
        .select("id, name, surface")
        .eq("club_id", club.id)
        .eq("is_active", true)
        .order("name"),

      // Occupancy denominator (Operación) + onboarding step3 check.
      supabase
        .from("club_operating_hours")
        .select("day_of_week, is_open, opens_at, closes_at")
        .eq("club_id", club.id),

      // Empty-state check — does this club have ANY reservation, ever.
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("club_id", club.id)
        .limit(1),

      supabase
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("club_id", club.id)
        .eq("role", "PLAYER")
        .eq("is_active", true),

      supabase
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("club_id", club.id)
        .in("role", ["OWNER", "ADMIN"])
        .eq("is_active", true),
    ]);

  const courts = courtsRes.data ?? [];
  const hasAnyReservation = (hasAnyReservationRes.count ?? 0) > 0;
  const playerCount = playerCountRes.count ?? 0;
  const adminCount = adminCountRes.count ?? 0;
  const isEmpty = !hasAnyReservation;

  const dbHours = (operatingHoursRes.data ?? []) as OperatingHour[];
  const effectiveHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => {
    const found = dbHours.find((h) => h.day_of_week === def.day_of_week);
    return found ?? def;
  });

  // ─── Onboarding wizard step completion ───────────────────────────────────────
  const step1Done = !!club.description;
  const step2Done = !!club.city;
  const step3Done = dbHours.length > 0 && (club.allowed_reservation_durations?.length ?? 0) > 0;
  const step4Done = courts.length > 0;

  const pendingSetupItems = [
    { done: step1Done, step: 1, todoLabel: "Falta completar perfil público" },
    { done: step2Done, step: 2, todoLabel: "Falta configurar ubicación" },
    { done: step3Done, step: 3, todoLabel: "Falta configurar horarios" },
    { done: step4Done, step: 4, todoLabel: "Falta agregar una cancha" },
  ].filter((item) => !item.done);
  const firstIncompleteStep = pendingSetupItems[0]?.step ?? null;

  // Defined once, rendered in two places: unconditionally for the empty
  // state (unchanged position/behavior), and inside the "Actividad Reciente"
  // tab for a populated club — same JSX, no logic duplicated.
  const quickAccessSection = (
    <div>
      <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
        Acceso rápido
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(step4Done
          ? [
              { label: "Reservaciones", Icon: CalendarDays, href: `/${slug}/admin/reservations`, color: "var(--club-primary)" },
              { label: "Canchas",       Icon: Home,         href: `/${slug}/dashboard?tab=canchas`, color: "var(--club-secondary)" },
              { label: "Jugadores",     Icon: Users,        href: `/${slug}/admin/players`,       color: "var(--club-primary)" },
              { label: "Configuración", Icon: Settings,     href: clubHubPath(slug, "configuracion"), color: "var(--club-secondary)" },
            ]
          : [
              { label: "Canchas",       Icon: Home,         href: `/${slug}/dashboard?tab=canchas`, color: "var(--club-primary)" },
              { label: "Configuración", Icon: Settings,     href: clubHubPath(slug, "configuracion"), color: "var(--club-secondary)" },
              { label: "Jugadores",     Icon: Users,        href: `/${slug}/admin/players`,       color: "var(--club-primary)" },
              { label: "Reservaciones", Icon: CalendarDays, href: `/${slug}/admin/reservations`,  color: "var(--club-secondary)" },
            ]
        ).map(({ label, Icon, href, color }) => (
          <Link
            key={label}
            href={href}
            style={{ "--qa-color": color } as React.CSSProperties}
            className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--qa-color)] hover:bg-[color-mix(in_srgb,var(--qa-color)_6%,transparent)] transition-colors group"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                color,
              }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-brand-muted group-hover:text-white transition-colors">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );

  // ─── Per-view fetches — only the active tab's data is loaded, so switching
  // views never pays for the other three's queries ─────────────────────────────
  let operacionContent: React.ReactNode = null;
  let rendimientoContent: React.ReactNode = null;
  let actividadContent: React.ReactNode = null;
  let canchasContent: React.ReactNode = null;

  if (!isEmpty && activeTab === "operacion") {
    const [upcomingRes, futureWeekRes] = await Promise.all([
      // Próximo turno por cancha — upcoming confirmed reservations from right
      // now onward, sorted chronologically; the first row per court_id is
      // that court's nearest upcoming reservation.
      supabase
        .from("reservations")
        .select(
          `id, court_id, date, start_time, duration_minutes,
           reservation_players(profiles(full_name))`
        )
        .eq("club_id", club.id)
        .eq("status", "confirmed")
        .or(`date.gt.${todayStr},and(date.eq.${todayStr},start_time.gte.${nowTimeStr})`)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(50),

      // "Operación próxima" — confirmed reservations today through +6 days.
      supabase
        .from("reservations")
        .select("court_id, date, start_time, duration_minutes")
        .eq("club_id", club.id)
        .eq("status", "confirmed")
        .gte("date", todayStr)
        .lte("date", toDateStr(addDays(today, 6))),
    ]);

    const nextSlotByCourtId = new Map<
      string,
      { startTime: string; endTime: string; playerName: string }
    >();
    for (const r of (upcomingRes.data ?? []) as unknown as UpcomingRow[]) {
      if (nextSlotByCourtId.has(r.court_id)) continue;
      nextSlotByCourtId.set(r.court_id, {
        startTime: r.start_time.slice(0, 5),
        endTime: calcEndTime(r.start_time.slice(0, 5), r.duration_minutes),
        playerName:
          r.reservation_players.map((rp) => rp.profiles?.full_name).filter(Boolean)[0] ?? "—",
      });
    }

    type FutureRow = { court_id: string; date: string; start_time: string; duration_minutes: number };
    const futureWeekRows = (futureWeekRes.data ?? []) as FutureRow[];
    const next7End = addDays(today, 6);

    const todayRows = futureWeekRows.filter((r) => r.date === todayStr);
    const todayReservedMin = todayRows.reduce((sum, r) => sum + r.duration_minutes, 0);
    const todayAvailableMinPerCourt = computeAvailableMinutesForRange(effectiveHours, today, today);
    const todayCapacityMin = todayAvailableMinPerCourt * courts.length;
    const todayFreeMin = Math.max(0, todayCapacityMin - todayReservedMin);

    const next7ReservedMin = futureWeekRows.reduce((sum, r) => sum + r.duration_minutes, 0);
    const next7AvailableMinPerCourt = computeAvailableMinutesForRange(effectiveHours, today, next7End);
    const next7CapacityMin = next7AvailableMinPerCourt * courts.length;
    const next7FreeMin = Math.max(0, next7CapacityMin - next7ReservedMin);
    const next7OccupancyPct =
      next7CapacityMin > 0 ? Math.min(100, Math.round((next7ReservedMin / next7CapacityMin) * 100)) : 0;
    // Neutral, not magnitude-colored — projected occupancy is descriptive
    // information, never an alert or a success on its own (a quiet week
    // isn't an "error"); see NEUTRAL_METRIC_COLOR below.
    const next7OccupancyColor = NEUTRAL_METRIC_COLOR;

    const nextUpcoming = ((upcomingRes.data ?? []) as unknown as UpcomingRow[])[0] ?? null;
    const nextUpcomingCourtName = nextUpcoming
      ? courts.find((c) => c.id === nextUpcoming.court_id)?.name ?? "—"
      : null;

    const next7ReservedMinByCourt = new Map<string, number>();
    for (const r of futureWeekRows) {
      next7ReservedMinByCourt.set(r.court_id, (next7ReservedMinByCourt.get(r.court_id) ?? 0) + r.duration_minutes);
    }
    const busiestCourts = courts
      .map((c) => {
        const reservedMin = next7ReservedMinByCourt.get(c.id) ?? 0;
        const pct =
          next7AvailableMinPerCourt > 0
            ? Math.min(100, Math.round((reservedMin / next7AvailableMinPerCourt) * 100))
            : 0;
        return { id: c.id, name: c.name, pct };
      })
      .sort((a, b) => b.pct - a.pct);

    const next7CourtProjection = (
      courts as { id: string; name: string; surface: string | null }[]
    ).map((c) => {
      const reservedMin = next7ReservedMinByCourt.get(c.id) ?? 0;
      const pct =
        next7AvailableMinPerCourt > 0
          ? Math.min(100, Math.round((reservedMin / next7AvailableMinPerCourt) * 100))
          : 0;
      return {
        id: c.id,
        name: c.name,
        surface: c.surface,
        pct,
        // Neutral — per-court occupancy is descriptive, not an alert/success.
        color: NEUTRAL_METRIC_COLOR,
        nextSlot: nextSlotByCourtId.get(c.id) ?? null,
      };
    });

    const next7ReservedMinByDate = new Map<string, number>();
    for (const r of futureWeekRows) {
      next7ReservedMinByDate.set(r.date, (next7ReservedMinByDate.get(r.date) ?? 0) + r.duration_minutes);
    }
    const next7DayHeatmap = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      const dateStr = toDateStr(d);
      const hours = effectiveHours.find((h) => h.day_of_week === d.getDay())!;
      if (!hours.is_open) return { id: dateStr, label: DAY_NAMES[d.getDay()].slice(0, 3), pct: 0, closed: true };
      const availableMin = computeAvailableMinutesForRange(effectiveHours, d, d) * courts.length;
      const reservedMin = next7ReservedMinByDate.get(dateStr) ?? 0;
      const pct = availableMin > 0 ? Math.min(100, Math.round((reservedMin / availableMin) * 100)) : 0;
      return { id: dateStr, label: DAY_NAMES[d.getDay()].slice(0, 3), pct, closed: false };
    });

    operacionContent = (
      <div className="mb-6 sm:mb-8">
        <h2 className="sr-only">Operación próxima</h2>

        {/* Hoy — snapshot compacto */}
        <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 sm:p-5 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4" style={{ color: "var(--club-primary)" }} />
            <p className="text-sm font-semibold text-white">Hoy</p>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <MiniStat value={String(todayRows.length)} label="reservas" />
            <MiniStat value={formatHours(todayReservedMin)} label="h reservadas" />
            <MiniStat value={formatHours(todayFreeMin)} label="h libres" />
          </div>
          <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-3">
            <p className="text-[11px] text-brand-muted shrink-0">Próxima reserva</p>
            {nextUpcoming ? (
              <p className="text-sm font-semibold text-white truncate">
                {nextUpcoming.start_time.slice(0, 5)} · {nextUpcomingCourtName}
              </p>
            ) : (
              <p className="text-sm text-brand-muted/70">Sin reservas</p>
            )}
          </div>
        </div>

        {/* Próximos 7 días — reservas + capacidad + ocupación, en una sola tarjeta */}
        <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 sm:p-5 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarRange className="w-4 h-4" style={{ color: "var(--club-secondary)" }} />
            <p className="text-sm font-semibold text-white">Próximos 7 días</p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-4">
            <MiniStat value={String(futureWeekRows.length)} label="reservas" />
            <MiniStat value={String(courts.length)} label="canchas" />
            <MiniStat value={formatHours(next7ReservedMin)} label="h reservadas" />
            <MiniStat value={formatHours(next7FreeMin)} label="h libres" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${next7OccupancyPct}%`, backgroundColor: next7OccupancyColor }}
              />
            </div>
            <span
              className="text-2xl font-bold tabular-nums shrink-0"
              style={{ color: next7OccupancyColor }}
            >
              {next7OccupancyPct}%
            </span>
          </div>
          <p className="text-[11px] text-brand-muted/70 mt-1.5">Ocupación proyectada de la capacidad total</p>
        </div>

        {/* Canchas más ocupadas + Días con menor ocupación */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4" style={{ color: "var(--club-secondary)" }} />
              <p className="text-sm font-semibold text-white">Canchas más ocupadas</p>
              <span className="text-[11px] text-brand-muted ml-auto">próx. 7 días</span>
            </div>
            {busiestCourts.length === 0 ? (
              <p className="text-sm text-brand-muted">Sin canchas activas</p>
            ) : (
              <div className="flex flex-col gap-3">
                {busiestCourts.map((c) => {
                  // Neutral — "busiest" is a ranking, not an alert/success.
                  const color = NEUTRAL_METRIC_COLOR;
                  return (
                    <div key={c.id}>
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="text-sm text-white/90 font-medium truncate">{c.name}</span>
                        <span
                          className="text-sm font-bold tabular-nums shrink-0"
                          style={{ color }}
                        >
                          {c.pct}%
                        </span>
                      </div>
                      <div className="h-3.5 rounded-full bg-white/[0.07] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${c.pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4" style={{ color: "var(--club-primary)" }} />
              <p className="text-sm font-semibold text-white">Días con menor ocupación</p>
              <span className="text-[11px] text-brand-muted ml-auto">próx. 7 días</span>
            </div>
            <WeekdayOccupancyChart points={next7DayHeatmap} />
            <p className="text-[11px] text-brand-muted/60 mt-3">
              Útil para promociones, clínicas o torneos en los días más flojos.
            </p>
          </div>
        </div>

        {/* Proyección por cancha */}
        <div className="mt-6 sm:mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
              Proyección por cancha
            </h2>
            <span className="text-[11px] text-brand-muted">próx. 7 días</span>
          </div>
          <CourtOccupancyGrid
            items={next7CourtProjection}
            pctCaption="ocupación próx. 7 días"
            noSlotLabel="Sin próximas reservas"
          />
        </div>
      </div>
    );
  }

  if (!isEmpty && activeTab === "rendimiento") {
    const periodKey = resolveStatsPeriodKey(periodParam);
    const { start, end } = resolveStatsPeriod(periodKey);
    const { data: stats, error } = await getClubStatistics(supabase, club.id, start, end);

    rendimientoContent = (
      <div>
        <div className="flex justify-end mb-3">
          <PeriodSelector value={periodKey} />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {stats && stats.summary.totalReservations === 0 && (
          <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-white/10">
            <p className="text-white font-semibold mb-1">Aún no hay actividad en este periodo</p>
            <p className="text-sm text-brand-muted max-w-sm mx-auto">
              Cuando el club tenga reservas, aquí verás su evolución y uso por cancha.
            </p>
          </div>
        )}

        {stats && stats.summary.totalReservations > 0 && (
          <div className="flex flex-col gap-6">
            <StatsKpiGrid summary={stats.summary} previousSummary={stats.previousSummary} />

            <SectionCard
              title="Evolución de reservas"
              subtitle="Todas las reservas del periodo (confirmadas, pendientes, canceladas y rechazadas), por fecha de la reserva."
            >
              <TimelineChart points={stats.timeline} granularity={stats.timelineGranularity} />
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard title="Distribución por estado">
                <StatusDistributionChart statuses={stats.statuses} />
              </SectionCard>

              <SectionCard title="Uso por cancha">
                {stats.courts.length === 0 ? (
                  <p className="text-sm text-brand-muted/70">Sin reservas confirmadas en este periodo.</p>
                ) : (
                  <CourtUsageList courts={stats.courts} />
                )}
              </SectionCard>

              <SectionCard title="Actividad por día de la semana">
                <WeekdayActivityChart weekdays={stats.weekdays} />
              </SectionCard>

              <SectionCard title="Actividad por franja horaria">
                {stats.hourlySlots.length === 0 ? (
                  <p className="text-sm text-brand-muted/70">Sin reservas confirmadas en este periodo.</p>
                ) : (
                  <HourlySlotsChart hourlySlots={stats.hourlySlots} />
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!isEmpty && activeTab === "actividad") {
    const activityItems = await getRecentActivity(supabase, club.id, slug);
    actividadContent = (
      <div className="flex flex-col gap-8">
        <div className="bg-brand-surface border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white mb-5">Actividad reciente</h2>
          <ActivityFeed items={activityItems} />
        </div>
        {quickAccessSection}
      </div>
    );
  }

  if (!isEmpty && activeTab === "canchas") {
    // Filtered server-side by the resolved status, never fetched whole and
    // hidden with CSS — one query, no duplicate fetch.
    const { data: filteredCourts } = await supabase
      .from("courts")
      .select("*")
      .eq("club_id", club.id)
      .eq("is_active", courtsStatusFilter === "active")
      .order("name", { ascending: true });
    const courtList = (filteredCourts ?? []) as Court[];
    const isActiveFilter = courtsStatusFilter === "active";

    canchasContent = (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Canchas</h2>
            <p className="text-brand-muted mt-1 text-sm">Gestiona las canchas del club.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CourtsStatusFilter value={courtsStatusFilter} />
            <CreateCourtButton clubSlug={slug} clubId={club.id} />
          </div>
        </div>

        {courtList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <Home className="w-6 h-6 text-brand-muted" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              {isActiveFilter ? "No hay canchas activas" : "No hay canchas inactivas"}
            </h3>
            <p className="text-sm text-brand-muted max-w-sm mb-6">
              {isActiveFilter
                ? "Activa una cancha existente o crea una nueva para comenzar a recibir reservas."
                : "Todas las canchas del club están activas actualmente."}
            </p>
            {isActiveFilter && (
              <CreateCourtButton
                clubSlug={slug}
                clubId={club.id}
                className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200"
              />
            )}
          </div>
        )}

        {courtList.length > 0 && (
          <CourtsGrid courts={courtList} clubSlug={slug} clubId={club.id} />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10">

      {/* ─── Club Hero — only as visual guidance while onboarding is incomplete.
          Once configured, branding/public profile live exclusively in
          Página Pública and the Dashboard starts directly with the tabs. ── */}
      {pendingSetupItems.length > 0 && (
        <ClubHero club={club} variant="card" editable={membership.role === "OWNER"} />
      )}

      {/* ─── Onboarding wizard ─────────────────────────────────────────── */}
      {membership.role === "OWNER" && (
        <OnboardingWizard
          club={{
            ...club,
            allowed_reservation_durations: club.allowed_reservation_durations ?? [60, 90, 120],
          }}
          initialHours={effectiveHours}
          step1Done={step1Done}
          step2Done={step2Done}
          step3Done={step3Done}
          step4Done={step4Done}
        />
      )}

      {isEmpty ? (
        /* ─── Empty state: management dashboard summary ──────────────────── */
        <>
          {/* Sección 1 — KPIs principales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Canchas" value={String(courts.length)} Icon={Home} color="var(--club-primary)" />
            <KpiCard label="Jugadores" value={String(playerCount)} Icon={Users} color="var(--club-secondary)" />
            <KpiCard label="Reservas" value="0" Icon={CalendarDays} color="var(--club-primary)" />
            <KpiCard label="Administradores" value={String(adminCount)} Icon={Shield} color="var(--club-secondary)" />
          </div>

          {/* Sección 2 — Configuración pendiente (solo si falta algo) */}
          {pendingSetupItems.length > 0 && (
            <div className="bg-brand-surface border border-amber-400/20 rounded-2xl p-5 mb-8">
              <p className="text-sm font-semibold text-white mb-1">Configuración pendiente</p>
              <p className="text-xs text-brand-muted/70 mb-4">
                Todavía hay elementos por configurar antes de aprovechar completamente tu club.
              </p>
              <div className="flex flex-col gap-3 mb-5">
                {pendingSetupItems.map((item) => (
                  <div key={item.step} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "color-mix(in srgb, #EAB308 15%, transparent)" }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <span className="text-sm text-amber-300/90">{item.todoLabel}</span>
                  </div>
                ))}
              </div>
              <Link
                href={`/${slug}/dashboard?setupStep=${firstIncompleteStep}`}
                className="inline-flex items-center justify-center h-9 px-4 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
                style={{ backgroundColor: "var(--club-primary)", color: "var(--club-bg, #001A24)" }}
              >
                Continuar configuración
              </Link>
            </div>
          )}

          {/* Sección 3 — Próximos pasos recomendados */}
          <div className="mb-8">
            <p className="text-sm font-semibold text-white mb-4">Próximos pasos recomendados</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { label: "Invitar jugadores", sub: "Comparte el enlace de invitación con tu comunidad", href: `/${slug}/admin/players`, Icon: Users, color: "var(--club-primary)", external: false },
                  { label: "Crear primera reserva", sub: "Registra manualmente el primer turno del club", href: `/${slug}/admin/reservations/new`, Icon: CalendarDays, color: "var(--club-secondary)", external: false },
                  { label: "Ver página pública", sub: "Así es como los jugadores ven tu club", href: `/${slug}`, Icon: Share2, color: "var(--club-primary)", external: true },
                ] as const
              ).map((step) => (
                <Link
                  key={step.label}
                  href={step.href}
                  target={step.external ? "_blank" : undefined}
                  style={{ "--ns-color": step.color } as React.CSSProperties}
                  className="flex flex-col gap-2 p-4 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--ns-color)] transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `color-mix(in srgb, ${step.color} 15%, transparent)`, color: step.color }}
                  >
                    <step.Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{step.label}</p>
                    <p className="text-xs text-brand-muted/60 mt-0.5">{step.sub}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Sección 4 — Actividad reciente (placeholder) */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-8">
            <p className="text-sm font-semibold text-white mb-2">Actividad reciente</p>
            <p className="text-sm text-brand-muted">
              Aquí aparecerán las últimas reservas, registros de jugadores y actividad del club.
            </p>
          </div>

          {quickAccessSection}
        </>
      ) : (
        <DashboardTabs
          active={activeTab}
          operacion={operacionContent}
          rendimiento={rendimientoContent}
          actividad={actividadContent}
          canchas={canchasContent}
        />
      )}

    </div>
  );
}
