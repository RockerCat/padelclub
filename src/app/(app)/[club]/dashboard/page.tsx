import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  TrendingUp,
  TrendingDown,
  Users,
  Plus,
  ArrowRight,
  Home,
  Settings,
  Flame,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_OPERATING_HOURS,
  computeWeeklyAvailableMinutes,
  type OperatingHour,
} from "@/lib/operatingHours";

interface DashboardPageProps {
  params: Promise<{ club: string }>;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function getWeekMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}

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

function computePeakHour(startTimes: string[]): { hour: number; count: number } | null {
  if (!startTimes.length) return null;
  const freq = new Map<number, number>();
  for (const t of startTimes) {
    const h = parseInt(t.slice(0, 2), 10);
    freq.set(h, (freq.get(h) ?? 0) + 1);
  }
  let maxH = 0, maxC = 0;
  for (const [h, c] of freq) {
    if (c > maxC) { maxH = h; maxC = c; }
  }
  return { hour: maxH, count: maxC };
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

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name")
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr      = toDateStr(today);
  const yesterdayStr  = toDateStr(addDays(today, -1));
  const weekMonday    = getWeekMonday(today);
  const mondayStr     = toDateStr(weekMonday);
  const sundayStr     = toDateStr(addDays(weekMonday, 6));
  const thirtyDaysAgo = toDateStr(addDays(today, -30));

  // Previous week: compare same number of days elapsed (Mon-today vs Mon-sameday last week)
  const msPerDay           = 24 * 60 * 60 * 1000;
  const daysElapsed        = Math.round((today.getTime() - weekMonday.getTime()) / msPerDay);
  const prevWeekMonday     = addDays(weekMonday, -7);
  const prevWeekMondayStr  = toDateStr(prevWeekMonday);
  const prevWeekSameDayStr = toDateStr(addDays(prevWeekMonday, daysElapsed));

  // ─── Round 1: all independent fetches in parallel ────────────────────────────
  const [
    weekCountRes,
    courtsRes,
    weekOccupancyRes,
    thirtyDayAllRes,
    operatingHoursRes,
    recentRes,
    prevWeekCountRes,
  ] = await Promise.all([
    // KPI 1 — confirmed reservations this week
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", mondayStr)
      .lte("date", sundayStr),

    // Courts — id + name ordered for per-court breakdown
    supabase
      .from("courts")
      .select("id, name")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("name"),

    // KPI 2 + KPI 3 + per-court occupancy: confirmed this week with court_id
    supabase
      .from("reservations")
      .select("court_id, duration_minutes")
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", mondayStr)
      .lte("date", sundayStr),

    // Insights source: all reservations last 30 days (confirmed + cancelled)
    // Used for: active players, peak hour, cancellation rate
    supabase
      .from("reservations")
      .select("id, status, start_time")
      .eq("club_id", club.id)
      .gte("date", thirtyDaysAgo),

    // Occupancy denominator — club operating hours
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", club.id),

    // Actividad reciente — last 10 by created_at, any status
    supabase
      .from("reservations")
      .select("id, date, start_time, duration_minutes, type, status, courts(name)")
      .eq("club_id", club.id)
      .order("created_at", { ascending: false })
      .limit(10),

    // Week comparison — confirmed count in prev week (same days elapsed for fair comparison)
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", prevWeekMondayStr)
      .lte("date", prevWeekSameDayStr),
  ]);

  const weekCount     = weekCountRes.count ?? 0;
  const prevWeekCount = prevWeekCountRes.count ?? 0;
  const courts        = courtsRes.data ?? [];
  const thirtyDayAll  = thirtyDayAllRes.data ?? [];
  const recent        = (recentRes.data ?? []) as unknown as RecentRow[];

  // Split 30-day data by status
  const confirmedIds30   = thirtyDayAll.filter((r) => r.status === "confirmed").map((r) => r.id);
  const confirmedCount30 = confirmedIds30.length;
  const cancelledCount30 = thirtyDayAll.filter((r) => r.status === "cancelled").length;

  // ─── Round 2: active players (depends on confirmedIds30) ─────────────────────
  const activePlayers =
    confirmedIds30.length > 0
      ? await supabase
          .from("reservation_players")
          .select("profile_id")
          .in("reservation_id", confirmedIds30)
          .then((r) => r.data ?? [])
      : [];

  const activePlayerCount = new Set(activePlayers.map((p) => p.profile_id)).size;

  // ─── Operating hours (occupancy denominator) ─────────────────────────────────
  const dbHours = (operatingHoursRes.data ?? []) as OperatingHour[];
  const effectiveHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => {
    const found = dbHours.find((h) => h.day_of_week === def.day_of_week);
    return found ?? def;
  });
  const weekDayNums          = [1, 2, 3, 4, 5, 6, 0];
  const availableMinPerCourt = computeWeeklyAvailableMinutes(effectiveHours, weekDayNums);

  // ─── KPI 2: Horas reservadas · KPI 3: Ocupación semanal ─────────────────────
  type OccupancyRow = { court_id: string; duration_minutes: number };
  const weekOccupancyData = (weekOccupancyRes.data ?? []) as OccupancyRow[];
  const weekMinutes = weekOccupancyData.reduce((sum, r) => sum + r.duration_minutes, 0);
  const totalAvailableMinutes = availableMinPerCourt * courts.length;
  const occupancyPct =
    totalAvailableMinutes > 0
      ? Math.min(100, Math.round((weekMinutes / totalAvailableMinutes) * 100))
      : 0;
  const occupancyColor =
    occupancyPct >= 70 ? "#22C55E" : occupancyPct >= 40 ? "#EAB308" : "#EF4444";

  // ─── Insights: per-court occupancy ───────────────────────────────────────────
  const reservedMinByCourt = new Map<string, number>();
  for (const r of weekOccupancyData) {
    reservedMinByCourt.set(r.court_id, (reservedMinByCourt.get(r.court_id) ?? 0) + r.duration_minutes);
  }
  const courtOccupancy = (courts as { id: string; name: string }[]).map((c) => {
    const reservedMin = reservedMinByCourt.get(c.id) ?? 0;
    const pct =
      availableMinPerCourt > 0
        ? Math.min(100, Math.round((reservedMin / availableMinPerCourt) * 100))
        : 0;
    return {
      id: c.id,
      name: c.name,
      reservedHours: +(reservedMin / 60).toFixed(1),
      availableHours: +(availableMinPerCourt / 60).toFixed(1),
      pct,
      color: pct >= 70 ? "#22C55E" : pct >= 40 ? "#EAB308" : "#EF4444",
    };
  });

  // ─── Insights: hora pico ─────────────────────────────────────────────────────
  const confirmedStartTimes = thirtyDayAll
    .filter((r) => r.status === "confirmed")
    .map((r) => r.start_time as string);
  const peakHour = computePeakHour(confirmedStartTimes);

  // ─── Insights: tasa de cancelación ───────────────────────────────────────────
  const totalCount30    = confirmedCount30 + cancelledCount30;
  const cancellationPct =
    totalCount30 > 0 ? Math.round((cancelledCount30 / totalCount30) * 100) : 0;

  // ─── Insights: comparación vs semana anterior ────────────────────────────────
  // Same-days-elapsed comparison: if today is Wed, Mon–Wed this week vs Mon–Wed last week
  let weekChangeLabel  = "—";
  let weekChangeColor  = "#94A3B8";
  let weekChangeTrend: "up" | "down" | "flat" = "flat";
  if (prevWeekCount === 0 && weekCount > 0) {
    weekChangeLabel = `+${weekCount}`;
    weekChangeColor = "#22C55E";
    weekChangeTrend = "up";
  } else if (prevWeekCount > 0) {
    const pct = Math.round(((weekCount - prevWeekCount) / prevWeekCount) * 100);
    weekChangeLabel = pct > 0 ? `▲ +${pct}%` : pct < 0 ? `▼ ${pct}%` : "=";
    weekChangeColor = pct > 0 ? "#22C55E" : pct < 0 ? "#EF4444" : "#94A3B8";
    weekChangeTrend = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  }

  const isEmpty = recent.length === 0;

  return (
    <div className="p-6 md:p-10">

      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-surface border border-white/10 p-6 mb-8">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--club-primary) 8%, transparent), color-mix(in srgb, var(--club-secondary) 8%, transparent))",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{
            background: "linear-gradient(to right, var(--club-primary), var(--club-secondary))",
          }}
        />
        <p className="text-sm text-brand-muted mb-0.5 relative">Panel del club</p>
        <h1 className="text-2xl font-bold text-white mb-1 relative">{club.name}</h1>
        <p className="text-sm text-brand-muted relative">
          {courts.length === 0
            ? "Sin canchas activas"
            : courts.length === 1
            ? "1 cancha activa"
            : `${courts.length} canchas activas`}
        </p>
      </div>

      {isEmpty ? (
        /* ─── Empty state ─────────────────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 bg-brand-surface border border-dashed border-white/10 rounded-2xl mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{
              backgroundColor: "color-mix(in srgb, var(--club-primary) 12%, transparent)",
            }}
          >
            <CalendarDays className="w-8 h-8" style={{ color: "var(--club-primary)" }} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Aún no tienes reservas registradas
          </h2>
          <p className="text-sm text-brand-muted mb-8 max-w-sm">
            Registra la primera reserva de tu club para comenzar a ver métricas aquí.
          </p>
          <Link
            href={`/${slug}/admin/reservations/new`}
            className="inline-flex items-center gap-2 h-10 px-6 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{
              backgroundColor: "var(--club-primary)",
              color: "var(--club-bg, #001A24)",
            }}
          >
            <Plus className="w-4 h-4" />
            Crear primera reserva
          </Link>
        </div>
      ) : (
        <>
          {/* ─── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard
              label="Reservas esta semana"
              value={String(weekCount)}
              Icon={CalendarDays}
              color="var(--club-primary)"
            />
            <KpiCard
              label="Horas reservadas"
              value={formatHours(weekMinutes)}
              unit="h"
              sub="esta semana"
              Icon={Clock}
              color="var(--club-secondary)"
            />
            <KpiCard
              label="Ocupación semanal"
              value={String(occupancyPct)}
              unit="%"
              Icon={TrendingUp}
              color={occupancyColor}
            />
            <KpiCard
              label="Jugadores activos"
              value={String(activePlayerCount)}
              sub="últimos 30 días"
              Icon={Users}
              color="var(--club-primary)"
            />
          </div>

          {/* ─── Insights del Club ───────────────────────────────────────── */}
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-4">
              Insights del Club
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Ocupación por cancha ───────────────────────────────── */}
              <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-sm font-semibold text-white">Ocupación por cancha</p>
                  <span className="text-[11px] text-brand-muted">Esta semana</span>
                </div>
                {courtOccupancy.length === 0 ? (
                  <p className="text-sm text-brand-muted">Sin canchas activas</p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {courtOccupancy.map((c) => (
                      <div key={c.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white">{c.name}</span>
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color: c.color }}
                          >
                            {c.pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden mb-1.5">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${c.pct}%`, backgroundColor: c.color }}
                          />
                        </div>
                        <p className="text-[11px] text-brand-muted/70">
                          {c.reservedHours}h reservadas · {c.availableHours}h disponibles
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Right column: 3 stacked insight cards ───────────────── */}
              <div className="flex flex-col gap-4">

                {/* Hora pico */}
                <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white">Hora pico</p>
                    <span className="text-[11px] text-brand-muted">Últimos 30 días</span>
                  </div>
                  {peakHour ? (
                    <>
                      <div className="flex items-center gap-2.5 mb-1">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: "color-mix(in srgb, #EAB308 15%, transparent)",
                          }}
                        >
                          <Flame className="w-3.5 h-3.5" style={{ color: "#EAB308" }} />
                        </div>
                        <span
                          className="text-2xl font-bold tabular-nums"
                          style={{ color: "#EAB308" }}
                        >
                          {String(peakHour.hour).padStart(2, "0")}:00
                          <span className="text-base font-normal text-brand-muted ml-1">
                            – {String(peakHour.hour + 1).padStart(2, "0")}:00
                          </span>
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-muted/70">
                        {peakHour.count} reserva{peakHour.count !== 1 ? "s" : ""} en este horario
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-brand-muted">Sin datos suficientes</p>
                  )}
                </div>

                {/* Cancelaciones */}
                <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white">Cancelaciones</p>
                    <span className="text-[11px] text-brand-muted">Últimos 30 días</span>
                  </div>
                  {totalCount30 > 0 ? (
                    <>
                      <div className="flex items-center gap-2.5 mb-1">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor:
                              cancelledCount30 === 0
                                ? "color-mix(in srgb, #22C55E 15%, transparent)"
                                : "color-mix(in srgb, #EF4444 15%, transparent)",
                          }}
                        >
                          <XCircle
                            className="w-3.5 h-3.5"
                            style={{
                              color: cancelledCount30 === 0 ? "#22C55E" : "#EF4444",
                            }}
                          />
                        </div>
                        <span
                          className="text-2xl font-bold tabular-nums"
                          style={{
                            color: cancelledCount30 === 0 ? "#22C55E" : "#EF4444",
                          }}
                        >
                          {cancellationPct}%
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-muted/70">
                        {cancelledCount30} de {totalCount30} reserva
                        {totalCount30 !== 1 ? "s" : ""} cancelada
                        {cancelledCount30 !== 1 ? "s" : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-brand-muted">Sin datos suficientes</p>
                  )}
                </div>

                {/* Comparación vs semana anterior */}
                <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white">Vs semana anterior</p>
                    <span className="text-[11px] text-brand-muted">Mismo período</span>
                  </div>
                  {prevWeekCount === 0 && weekCount === 0 ? (
                    <p className="text-sm text-brand-muted">Sin reservas en ambas semanas</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 mb-1">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${weekChangeColor} 15%, transparent)`,
                          }}
                        >
                          {weekChangeTrend === "down" ? (
                            <TrendingDown
                              className="w-3.5 h-3.5"
                              style={{ color: weekChangeColor }}
                            />
                          ) : (
                            <TrendingUp
                              className="w-3.5 h-3.5"
                              style={{ color: weekChangeColor }}
                            />
                          )}
                        </div>
                        <span
                          className="text-2xl font-bold tabular-nums"
                          style={{ color: weekChangeColor }}
                        >
                          {weekChangeLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-muted/70">
                        {weekCount} esta sem · {prevWeekCount} semana anterior
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Actividad reciente ──────────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-8">
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
          </div>
        </>
      )}

      {/* ─── Acceso rápido (siempre visible) ─────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          Acceso rápido
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              { label: "Reservaciones", Icon: CalendarDays, href: `/${slug}/admin/reservations`, color: "var(--club-primary)" },
              { label: "Canchas",       Icon: Home,         href: `/${slug}/admin/courts`,        color: "var(--club-secondary)" },
              { label: "Jugadores",     Icon: Users,        href: `/${slug}/admin/players`,       color: "var(--club-primary)" },
              { label: "Configuración", Icon: Settings,     href: `/${slug}/admin`,               color: "var(--club-secondary)" },
            ] as const
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

    </div>
  );
}
