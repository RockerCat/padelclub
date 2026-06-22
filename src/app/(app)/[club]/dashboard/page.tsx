import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  TrendingUp,
  Users,
  ArrowRight,
  Home,
  Settings,
  AlertTriangle,
  Shield,
  Share2,
  CalendarClock,
  CalendarRange,
  Gauge,
  Flame,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_OPERATING_HOURS,
  DAY_NAMES,
  computeAvailableMinutesForRange,
  computeAvailableMinutesByWeekday,
  type OperatingHour,
} from "@/lib/operatingHours";
import { resolveDashboardRange, getTrendBuckets } from "@/lib/dashboardRange";
import { DashboardTabs } from "./DashboardTabs";
import { resolveDashboardTab } from "./dashboardTabsConfig";
import { OnboardingWizard } from "./OnboardingWizard";
import { ClubHero } from "@/components/clubs/ClubHero";
import { CourtIllustration, getSurfaceLabel } from "@/components/courts/CourtIllustration";
import { TrendChart } from "./TrendChart";
import { WeekdayOccupancyChart } from "./WeekdayOccupancyChart";
import { TopHoursChart } from "./TopHoursChart";
import { DateRangeSelector } from "./DateRangeSelector";

interface DashboardPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

const MONTH_ES   = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const WEEKDAY_ES = ["dom","lun","mar","mié","jue","vie","sáb"];

function formatDate(dateStr: string, todayStr: string, yesterdayStr: string): string {
  if (dateStr === todayStr) return "Hoy";
  if (dateStr === yesterdayStr) return "Ayer";
  const d = new Date(dateStr + "T00:00:00");
  return `${WEEKDAY_ES[d.getDay()]} ${d.getDate()} ${MONTH_ES[d.getMonth()]}`;
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

type RecentRow = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  status: string;
  courts: { name: string } | null;
};

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

// Per-court occupancy card grid — shared by "Ocupación por cancha" (Rendimiento
// Histórico) and "Proyección por cancha" (Operación Próxima). Only the
// underlying dataset and captions differ between the two.
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
  const illustrationWidthClass = columnCount === 3 ? "w-[200px]" : "w-[260px]";

  return (
    <div className={`grid ${gridClass} gap-4`}>
      {items.map((c) => (
        <div
          key={c.id}
          className="bg-brand-surface border border-white/10 rounded-2xl p-4 flex gap-4"
        >
          <div className={`relative shrink-0 ${illustrationWidthClass}`}>
            <div className="absolute top-1 left-1 z-10 flex gap-1.5" />
            <CourtIllustration surface={c.surface} className="w-full" />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-base font-semibold text-white uppercase tracking-wide truncate">
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

            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <p className="text-[11px] text-brand-muted mb-1">Próximo turno:</p>
              {c.nextSlot ? (
                <div className="flex items-start gap-1.5">
                  <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: c.color }} />
                  <div>
                    <p className="text-sm font-semibold text-white leading-tight">
                      {c.nextSlot.startTime} - {c.nextSlot.endTime}
                    </p>
                    <p className="text-sm font-semibold text-white leading-tight">
                      {c.nextSlot.playerName}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-brand-muted/70">{noSlotLabel}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const { club: slug } = await params;
  const resolvedSearchParams = await searchParams;
  const rangeParam =
    typeof resolvedSearchParams.range === "string" ? resolvedSearchParams.range : undefined;
  const fromParam =
    typeof resolvedSearchParams.from === "string" ? resolvedSearchParams.from : undefined;
  const toParam =
    typeof resolvedSearchParams.to === "string" ? resolvedSearchParams.to : undefined;
  const activeTab = resolveDashboardTab(
    typeof resolvedSearchParams.tab === "string" ? resolvedSearchParams.tab : undefined
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, slug, name, description, city, state, country, address, latitude, longitude, logo_url, cover_image_url, visibility, primary_color, secondary_color, whatsapp, instagram, facebook, youtube, allowed_reservation_durations")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!club) notFound();

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();
  if (!membership) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(membership.role)) redirect(`/${slug}`);

  // ─── Date ranges ─────────────────────────────────────────────────────────────
  const now = new Date();
  const nowTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr      = toDateStr(today);
  const yesterdayStr  = toDateStr(addDays(today, -1));

  // Selected analysis range (?range=, +?from=/?to= for custom) — drives all
  // historical/analytics sections below. "Próximo turno" stays real-time and
  // is NOT affected by it.
  const range = resolveDashboardRange(rangeParam, today, fromParam, toParam);

  // ─── Round 1: all independent fetches in parallel ────────────────────────────
  const [
    rangeCountRes,
    courtsRes,
    rangeOccupancyRes,
    rangeInsightsRes,
    operatingHoursRes,
    recentRes,
    hasAnyReservationRes,
    upcomingRes,
    prevRangeCountRes,
    playerCountRes,
    adminCountRes,
    futureWeekRes,
  ] = await Promise.all([
    // KPI 1 — confirmed reservations in the selected range
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", range.current.startStr)
      .lte("date", range.current.endStr),

    // Courts — id + name + surface ordered for per-court breakdown
    supabase
      .from("courts")
      .select("id, name, surface")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("name"),

    // KPI 2 + KPI 3 + per-court occupancy + trend chart: confirmed in the
    // selected range, with court_id and date (date powers the trend buckets)
    supabase
      .from("reservations")
      .select("court_id, duration_minutes, date")
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", range.current.startStr)
      .lte("date", range.current.endStr),

    // Insights source: all reservations in the selected range (confirmed + cancelled)
    // Used for: active players (overall + trend), peak hour
    supabase
      .from("reservations")
      .select("id, status, start_time, date")
      .eq("club_id", club.id)
      .gte("date", range.current.startStr)
      .lte("date", range.current.endStr),

    // Occupancy denominator + onboarding step3 check
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", club.id),

    // Actividad reciente — last 10 by created_at within the selected range, any status
    supabase
      .from("reservations")
      .select("id, date, start_time, duration_minutes, type, status, courts(name)")
      .eq("club_id", club.id)
      .gte("date", range.current.startStr)
      .lte("date", range.current.endStr)
      .order("created_at", { ascending: false })
      .limit(10),

    // Empty-state check — does this club have ANY reservation, ever (any status,
    // any date)? Decoupled from the selected range so the empty dashboard only
    // depends on whether the club has ever had activity, not on the filter.
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .limit(1),

    // Próximo turno por cancha — upcoming confirmed reservations from right now
    // onward, sorted chronologically; the first row per court_id is its next
    // slot. Always real-time — NOT affected by the selected analysis range.
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

    // Comparison — confirmed count in the immediately preceding period (same length)
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", range.previous.startStr)
      .lte("date", range.previous.endStr),

    // Empty-state KPI — active players
    supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("role", "PLAYER")
      .eq("is_active", true),

    // Empty-state KPI — active owners/admins
    supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .in("role", ["OWNER", "ADMIN"])
      .eq("is_active", true),

    // "Operación próxima" — confirmed reservations today through +6 days
    // (fixed 7-day window, independent of the historical range selector).
    supabase
      .from("reservations")
      .select("court_id, date, start_time, duration_minutes")
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", todayStr)
      .lte("date", toDateStr(addDays(today, 6))),
  ]);

  const rangeCount     = rangeCountRes.count ?? 0;
  const prevRangeCount = prevRangeCountRes.count ?? 0;
  const courts         = courtsRes.data ?? [];
  const rangeInsightsAll = rangeInsightsRes.data ?? [];
  const recent          = (recentRes.data ?? []) as unknown as RecentRow[];
  const hasAnyReservation = (hasAnyReservationRes.count ?? 0) > 0;
  const playerCount     = playerCountRes.count ?? 0;
  const adminCount      = adminCountRes.count ?? 0;

  // Next slot per court — rows arrive sorted chronologically, so the first
  // occurrence of each court_id is that court's nearest upcoming reservation.
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
        r.reservation_players.map((rp) => rp.profiles?.full_name).filter(Boolean)[0] ??
        "—",
    });
  }

  // Split range data by status
  const confirmedRange   = rangeInsightsAll.filter((r) => r.status === "confirmed");
  const confirmedIdsRange = confirmedRange.map((r) => r.id);
  const dateByReservationId = new Map(confirmedRange.map((r) => [r.id, r.date]));

  // ─── Round 2: active players (depends on confirmedIdsRange) ──────────────────
  const activePlayers =
    confirmedIdsRange.length > 0
      ? await supabase
          .from("reservation_players")
          .select("profile_id, reservation_id")
          .in("reservation_id", confirmedIdsRange)
          .then((r) => r.data ?? [])
      : [];

  const activePlayerCount = new Set(activePlayers.map((p) => p.profile_id)).size;

  // ─── Operating hours (occupancy denominator) ─────────────────────────────────
  const dbHours = (operatingHoursRes.data ?? []) as OperatingHour[];
  const effectiveHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => {
    const found = dbHours.find((h) => h.day_of_week === def.day_of_week);
    return found ?? def;
  });
  const availableMinPerCourt = computeAvailableMinutesForRange(
    effectiveHours,
    range.current.start,
    range.current.end
  );

  // ─── KPI 2: Horas reservadas · KPI 3: Ocupación del período ─────────────────
  type OccupancyRow = { court_id: string; duration_minutes: number; date: string };
  const rangeOccupancyData = (rangeOccupancyRes.data ?? []) as OccupancyRow[];
  const rangeMinutes = rangeOccupancyData.reduce((sum, r) => sum + r.duration_minutes, 0);
  const totalAvailableMinutes = availableMinPerCourt * courts.length;
  const occupancyPct =
    totalAvailableMinutes > 0
      ? Math.min(100, Math.round((rangeMinutes / totalAvailableMinutes) * 100))
      : 0;
  const occupancyColor =
    occupancyPct >= 70 ? "#22C55E" : occupancyPct >= 40 ? "#EAB308" : "#EF4444";

  // ─── Evolución de Reservas: cantidad de reservas confirmadas por bucket ─────
  // Reuses rangeOccupancyData (one row per confirmed reservation) — counting
  // rows per bucket avoids a separate query. The "vs período anterior" badge
  // reuses periodChangeLabel/periodChangeColor (same reservation-count
  // comparison already computed below for the "Vs período anterior" card).
  const trendBuckets = getTrendBuckets(range);
  const trendPoints = trendBuckets.map((b) => {
    const count = rangeOccupancyData.filter(
      (r) => r.date >= b.startStr && r.date <= b.endStr
    ).length;
    return { id: b.startStr, label: b.label, value: count };
  });

  // ─── Jugadores Activos por bucket: jugadores únicos con reserva en el bucket ─
  // Reuses activePlayers (profile_id + reservation_id) and dateByReservationId
  // (built above) — no new query.
  const activePlayersTrendPoints = trendBuckets.map((b) => {
    const profileIds = new Set<string>();
    for (const ap of activePlayers) {
      const date = dateByReservationId.get(ap.reservation_id);
      if (date && date >= b.startStr && date <= b.endStr) profileIds.add(ap.profile_id);
    }
    return { id: b.startStr, label: b.label, value: profileIds.size };
  });

  // ─── Ocupación por día de la semana ──────────────────────────────────────────
  // Reuses the same rangeOccupancyData (no new query) and the same per-day
  // operating-hours lookup as the main occupancy denominator, just bucketed
  // by weekday instead of summed into one total.
  const reservedMinByWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rangeOccupancyData) {
    const dayNum = new Date(r.date + "T00:00:00").getDay();
    reservedMinByWeekday[dayNum] += r.duration_minutes;
  }
  const availableMinByWeekday = computeAvailableMinutesByWeekday(
    effectiveHours,
    range.current.start,
    range.current.end
  );
  const weekdayOccupancyPoints = [1, 2, 3, 4, 5, 6, 0]
    .map((dayNum) => {
      const totalAvailable = availableMinByWeekday[dayNum] * courts.length;
      const pct =
        totalAvailable > 0
          ? Math.min(100, Math.round((reservedMinByWeekday[dayNum] / totalAvailable) * 100))
          : 0;
      return { id: String(dayNum), label: DAY_NAMES[dayNum].slice(0, 3), pct };
    })
    .sort((a, b) => b.pct - a.pct);

  // ─── Insights: per-court occupancy ───────────────────────────────────────────
  const reservedMinByCourt = new Map<string, number>();
  for (const r of rangeOccupancyData) {
    reservedMinByCourt.set(r.court_id, (reservedMinByCourt.get(r.court_id) ?? 0) + r.duration_minutes);
  }
  const courtOccupancy = (courts as { id: string; name: string; surface: string | null }[]).map((c) => {
    const reservedMin = reservedMinByCourt.get(c.id) ?? 0;
    const pct =
      availableMinPerCourt > 0
        ? Math.min(100, Math.round((reservedMin / availableMinPerCourt) * 100))
        : 0;
    return {
      id: c.id,
      name: c.name,
      surface: c.surface,
      reservedHours: +(reservedMin / 60).toFixed(1),
      availableHours: +(availableMinPerCourt / 60).toFixed(1),
      pct,
      color: pct >= 70 ? "#22C55E" : pct >= 40 ? "#EAB308" : "#EF4444",
      nextSlot: nextSlotByCourtId.get(c.id) ?? null,
    };
  });

  // ─── Horas Más Demandadas: top 5 horarios por cantidad de reservas ──────────
  const confirmedStartTimes = rangeInsightsAll
    .filter((r) => r.status === "confirmed")
    .map((r) => r.start_time as string);
  const hourFrequency = new Map<number, number>();
  for (const t of confirmedStartTimes) {
    const hour = parseInt(t.slice(0, 2), 10);
    hourFrequency.set(hour, (hourFrequency.get(hour) ?? 0) + 1);
  }
  const topHoursPoints = [...hourFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour, count]) => ({ label: `${String(hour).padStart(2, "0")}:00`, count }));

  // ─── Insights: comparación vs período anterior (badge en Evolución de Reservas) ─
  let periodChangeLabel  = "—";
  let periodChangeColor  = "#94A3B8";
  if (prevRangeCount === 0 && rangeCount > 0) {
    periodChangeLabel = `+${rangeCount}`;
    periodChangeColor = "#22C55E";
  } else if (prevRangeCount > 0) {
    const pct = Math.round(((rangeCount - prevRangeCount) / prevRangeCount) * 100);
    periodChangeLabel = pct > 0 ? `▲ +${pct}%` : pct < 0 ? `▼ ${pct}%` : "=";
    periodChangeColor = pct > 0 ? "#22C55E" : pct < 0 ? "#EF4444" : "#94A3B8";
  }

  // Decoupled from the selected range — a populated club must keep showing the
  // operational dashboard even if the chosen period has zero activity.
  const isEmpty = !hasAnyReservation;

  // ─── Operación próxima: fixed 7-day window (today..+6), independent of the
  // historical range selector above. Source of truth is exclusively confirmed
  // reservations already in the DB — no projection/extrapolation.
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
  const next7OccupancyColor =
    next7OccupancyPct >= 70 ? "#22C55E" : next7OccupancyPct >= 40 ? "#EAB308" : "#EF4444";

  // Next single upcoming reservation overall (any court) — reuses the
  // already-fetched upcomingRes (sorted chronologically from right now on).
  const nextUpcoming = ((upcomingRes.data ?? []) as unknown as UpcomingRow[])[0] ?? null;
  const nextUpcomingCourtName = nextUpcoming
    ? courts.find((c) => c.id === nextUpcoming.court_id)?.name ?? "—"
    : null;

  // Canchas más ocupadas — próximos 7 días (capacity is the same per court,
  // since operating hours are club-wide, not per-court).
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

  // Proyección por cancha — mismo dataset que "Canchas más ocupadas" arriba
  // (next7ReservedMinByCourt / next7AvailableMinPerCourt), agregando el
  // "Próximo turno" real-time ya calculado para Ocupación por cancha.
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
      color: pct >= 70 ? "#22C55E" : pct >= 40 ? "#EAB308" : "#EF4444",
      nextSlot: nextSlotByCourtId.get(c.id) ?? null,
    };
  });

  // Heatmap — each of the next 7 calendar days individually (not a weekday
  // aggregate): reserved/available for that exact date. Closed days are
  // flagged rather than shown as a misleading 0%.
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

  // ─── Onboarding wizard step completion ───────────────────────────────────────
  // Step 1: club has a description (social links remain optional)
  const step1Done = !!club.description;
  // Step 2: club has city as minimum location signal
  const step2Done = !!club.city;
  // Step 3: operating hours + durations configured
  const step3Done = dbHours.length > 0 && (club.allowed_reservation_durations?.length ?? 0) > 0;
  // Step 4: at least one active court exists
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
              { label: "Canchas",       Icon: Home,         href: `/${slug}/admin/courts`,        color: "var(--club-secondary)" },
              { label: "Jugadores",     Icon: Users,        href: `/${slug}/admin/players`,       color: "var(--club-primary)" },
              { label: "Configuración", Icon: Settings,     href: `/${slug}/admin`,               color: "var(--club-secondary)" },
            ]
          : [
              { label: "Canchas",       Icon: Home,         href: `/${slug}/admin/courts`,        color: "var(--club-primary)" },
              { label: "Configuración", Icon: Settings,     href: `/${slug}/admin`,               color: "var(--club-secondary)" },
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
            <KpiCard label="Reservas" value={String(recent.length)} Icon={CalendarDays} color="var(--club-primary)" />
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
                  { label: "Ver página pública", sub: "Así es como los jugadores ven tu club", href: `/clubs/${slug}`, Icon: Share2, color: "var(--club-primary)", external: true },
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
          proxima={
          <div className="mb-8">
            <h2 className="sr-only">Operación próxima</h2>

            {/* Fila 1 — Hoy + Próximos 7 días */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarClock className="w-4 h-4" style={{ color: "var(--club-primary)" }} />
                  <p className="text-sm font-semibold text-white">Hoy</p>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <MiniStat value={String(todayRows.length)} label="reservas" />
                  <MiniStat value={formatHours(todayReservedMin)} label="h reservadas" />
                  <MiniStat value={formatHours(todayFreeMin)} label="h disponibles" />
                </div>
                <div className="pt-3 border-t border-white/[0.06]">
                  <p className="text-[11px] text-brand-muted mb-1">Próxima reserva:</p>
                  {nextUpcoming ? (
                    <p className="text-sm font-semibold text-white">
                      {nextUpcoming.start_time.slice(0, 5)} - {nextUpcomingCourtName}
                    </p>
                  ) : (
                    <p className="text-sm text-brand-muted/70">Sin reservas programadas</p>
                  )}
                </div>
              </div>

              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarRange className="w-4 h-4" style={{ color: "var(--club-secondary)" }} />
                  <p className="text-sm font-semibold text-white">Próximos 7 días</p>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <MiniStat value={String(futureWeekRows.length)} label="reservas" />
                  <MiniStat value={formatHours(next7ReservedMin)} label="h reservadas" />
                  <MiniStat value={formatHours(next7FreeMin)} label="h disponibles" />
                </div>
                <div className="pt-3 border-t border-white/[0.06]">
                  <p className="text-[11px] text-brand-muted mb-1">Ocupación proyectada:</p>
                  <span className="text-2xl font-bold tabular-nums" style={{ color: next7OccupancyColor }}>
                    {next7OccupancyPct}%
                  </span>
                </div>
              </div>
            </div>

            {/* Fila 2 — Capacidad semanal (métrica más importante, ancho completo) */}
            <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="w-4 h-4" style={{ color: "var(--club-primary)" }} />
                <p className="text-sm font-semibold text-white">Capacidad semanal</p>
              </div>
              <p className="text-xs text-brand-muted/70 mb-4">
                Cuánto espacio te queda por vender en los próximos 7 días.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <MiniStat value={String(courts.length)} label="canchas activas" />
                <MiniStat value={formatHours(next7CapacityMin)} label="h disponibles" />
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
                  className="text-lg font-bold tabular-nums shrink-0"
                  style={{ color: next7OccupancyColor }}
                >
                  {next7OccupancyPct}%
                </span>
              </div>
            </div>

            {/* Fila 3 — Canchas más ocupadas + Días con menor ocupación */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4" style={{ color: "var(--club-secondary)" }} />
                  <p className="text-sm font-semibold text-white">Canchas más ocupadas</p>
                  <span className="text-[11px] text-brand-muted ml-auto">próx. 7 días</span>
                </div>
                {busiestCourts.length === 0 ? (
                  <p className="text-sm text-brand-muted">Sin canchas activas</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {busiestCourts.map((c) => {
                      const color = c.pct >= 70 ? "#22C55E" : c.pct >= 40 ? "#EAB308" : "#EF4444";
                      return (
                        <div key={c.id} className="flex items-center gap-3">
                          <span className="text-xs text-brand-muted w-20 shrink-0 truncate">{c.name}</span>
                          <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${c.pct}%`, backgroundColor: color }}
                            />
                          </div>
                          <span
                            className="text-xs font-semibold tabular-nums w-9 text-right shrink-0"
                            style={{ color }}
                          >
                            {c.pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
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

            {/* Fila 4 — Proyección por cancha */}
            <div className="mt-8">
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
          }
          historico={
          <>
          {/* ─── Selector de rango ─────────────────────────────────────────── */}
          <div className="flex justify-end mb-3">
            <DateRangeSelector
              value={range.key}
              customFrom={range.key === "custom" ? range.current.startStr : undefined}
              customTo={range.key === "custom" ? range.current.endStr : undefined}
              dateRangeLabel={range.dateRangeLabel}
            />
          </div>

          {/* ─── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard
              label={`Reservas ${range.label.toLowerCase()}`}
              value={String(rangeCount)}
              Icon={CalendarDays}
              color="var(--club-primary)"
            />
            <KpiCard
              label="Horas reservadas"
              value={formatHours(rangeMinutes)}
              unit="h"
              sub={range.label.toLowerCase()}
              Icon={Clock}
              color="var(--club-secondary)"
            />
            <KpiCard
              label="Ocupación del período"
              value={String(occupancyPct)}
              unit="%"
              Icon={TrendingUp}
              color={occupancyColor}
            />
            <KpiCard
              label="Jugadores activos"
              value={String(activePlayerCount)}
              sub={range.label.toLowerCase()}
              Icon={Users}
              color="var(--club-primary)"
            />
          </div>

          {/* ─── Insights del Club ───────────────────────────────────────── */}
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
              Insights del Club
            </h2>

            {/* Fila 1 — Horas Más Demandadas + Jugadores Activos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-white">Horas Más Demandadas</p>
                  <span className="text-[11px] text-brand-muted">{range.label}</span>
                </div>
                <TopHoursChart points={topHoursPoints} />
              </div>

              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-white">Jugadores Activos</p>
                  <span className="text-[11px] text-brand-muted">{range.label}</span>
                </div>
                <TrendChart points={activePlayersTrendPoints} />
              </div>
            </div>

            {/* Fila 2 — Evolución de Reservas + Ocupación por Día de la Semana */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-white">Evolución de Reservas</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-brand-muted">{range.label}</span>
                    {range.hasComparison && (
                      <span
                        className="text-xs font-semibold tabular-nums"
                        style={{ color: periodChangeColor }}
                      >
                        {periodChangeLabel} vs {range.comparisonLabel}
                      </span>
                    )}
                  </div>
                </div>
                <TrendChart points={trendPoints} />
              </div>

              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-white">Ocupación por Día de la Semana</p>
                  <span className="text-[11px] text-brand-muted">{range.label}</span>
                </div>
                <WeekdayOccupancyChart points={weekdayOccupancyPoints} />
              </div>
            </div>
          </div>

          {/* ─── Ocupación por cancha ───────────────────────────────────────── */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
                Ocupación por cancha
              </h2>
              <span className="text-[11px] text-brand-muted">{range.label}</span>
            </div>
            <CourtOccupancyGrid
              items={courtOccupancy}
              pctCaption={`ocupación ${range.label.toLowerCase()}`}
            />
          </div>
          </>
          }
          actividad={
          <div className="flex flex-col gap-8">
          {/* Extension point: Solicitudes de ingreso, Invitaciones pendientes,
              Alertas del sistema, Mantenimientos programados y Reservas
              canceladas recientemente pueden agregarse aquí como hermanos de
              este div — no implementados todavía, solo la estructura. */}

          {/* ─── Actividad reciente ──────────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Actividad reciente</h2>
              <Link
                href={`/${slug}/admin/reservations`}
                className="text-xs text-brand-muted hover:text-white transition-colors flex items-center gap-1"
              >
                Ver calendario
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {recent.length === 0 ? (
              <p className="text-sm text-brand-muted py-3">No hay reservas en este período.</p>
            ) : (
              <>
                {/* Table header — desktop only */}
                <div className="hidden md:grid grid-cols-[140px_1fr_80px_120px] gap-4 px-3 pb-2.5 border-b border-white/[0.06]">
                  {["Fecha", "Cancha", "Horario", "Estado"].map((h) => (
                    <span
                      key={h}
                      className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider"
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Rows */}
                <div className="flex flex-col divide-y divide-white/[0.04]">
                  {recent.map((r) => (
                    <Link
                      key={r.id}
                      href={`/${slug}/admin/reservations/${r.id}`}
                      className="flex flex-col md:grid md:grid-cols-[140px_1fr_80px_120px] md:gap-4 md:items-center px-3 py-3 -mx-3 rounded-xl hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="text-xs text-brand-muted md:text-sm md:text-white">
                        {formatDate(r.date, todayStr, yesterdayStr)}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5 md:mt-0">
                        <span className="text-sm font-medium text-white">
                          {r.courts?.name ?? "—"}
                        </span>
                        <span className="md:hidden text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-brand-muted font-medium">
                          {TYPE_LABELS[r.type] ?? r.type}
                        </span>
                      </div>
                      <span className="text-sm font-mono text-white mt-0.5 md:mt-0">
                        {r.start_time.slice(0, 5)}
                      </span>
                      {r.status === "confirmed" ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-400 mt-0.5 md:mt-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                          Confirmada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-400 mt-0.5 md:mt-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                          Cancelada
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>

          {quickAccessSection}
          </div>
          }
        />
      )}

    </div>
  );
}
