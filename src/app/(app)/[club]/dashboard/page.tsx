import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Users, Home, Settings, Plus, ArrowRight } from "lucide-react";
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

const MONTH_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const WEEKDAY_ES = ["dom","lun","mar","mié","jue","vie","sáb"];

function formatReservationDate(dateStr: string, todayStr: string): string {
  const tomorrowStr = toDateStr(addDays(new Date(todayStr + "T00:00:00"), 1));
  if (dateStr === todayStr) return "Hoy";
  if (dateStr === tomorrowStr) return "Mañana";
  const d = new Date(dateStr + "T00:00:00");
  return `${WEEKDAY_ES[d.getDay()]} ${d.getDate()} ${MONTH_ES[d.getMonth()]}`;
}

function formatCreatedAt(isoStr: string): string {
  // Parse ISO string directly to avoid server timezone drift
  const [, month, day] = isoStr.slice(0, 10).split("-").map(Number);
  const time = isoStr.slice(11, 16);
  return `${day} ${MONTH_ES[month - 1]} · ${time}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type UpcomingRow = {
  id: string;
  date: string;
  start_time: string;
  type: string;
  courts: { name: string } | null;
  reservation_players: Array<{ profiles: { full_name: string | null } | null }>;
};

type RecentRow = {
  id: string;
  date: string;
  start_time: string;
  created_at: string;
  created_by: string;
  type: string;
  status: string;
  courts: { name: string } | null;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const COURT_COLORS = ["#B7E000","#1698BE","#F87171","#FB923C","#A78BFA","#34D399"];

const TYPE_LABELS: Record<string, string> = { match: "Partido", class: "Clase", block: "Bloqueo" };

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const todayStr = toDateStr(today);
  const weekMonday = getWeekMonday(today);
  const mondayStr = toDateStr(weekMonday);
  const sundayStr = toDateStr(addDays(weekMonday, 6));
  const monthStartStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const thirtyDaysAgoStr = toDateStr(addDays(today, -30));

  // ─── Round 1: parallel fetches ────────────────────────────────────────────────
  const [
    weekCountRes,
    monthCountRes,
    courtsRes,
    memberCountRes,
    upcomingRes,
    recentCreatedRes,
    weekOccupancyRes,
    thirtyDayResRes,
    operatingHoursRes,
  ] = await Promise.all([
    supabase
      .from("reservations").select("id", { count: "exact", head: true })
      .eq("club_id", club.id).eq("status", "confirmed")
      .gte("date", mondayStr).lte("date", sundayStr),
    supabase
      .from("reservations").select("id", { count: "exact", head: true })
      .eq("club_id", club.id).eq("status", "confirmed")
      .gte("date", monthStartStr).lte("date", todayStr),
    supabase
      .from("courts").select("id, name, sort_order")
      .eq("club_id", club.id).eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("club_members").select("id", { count: "exact", head: true })
      .eq("club_id", club.id).eq("is_active", true),
    // Next 5 upcoming (today onward, confirmed, sorted by date+time)
    supabase
      .from("reservations")
      .select("id, date, start_time, type, courts(name), reservation_players(profiles(full_name))")
      .eq("club_id", club.id).eq("status", "confirmed")
      .gte("date", todayStr)
      .order("date", { ascending: true }).order("start_time", { ascending: true })
      .limit(5),
    // Last 10 created (any status, for activity feed)
    supabase
      .from("reservations")
      .select("id, date, start_time, created_at, created_by, type, status, courts(name)")
      .eq("club_id", club.id)
      .order("created_at", { ascending: false })
      .limit(10),
    // This week confirmed — used for occupancy calculation
    supabase
      .from("reservations").select("court_id, duration_minutes")
      .eq("club_id", club.id).eq("status", "confirmed")
      .gte("date", mondayStr).lte("date", sundayStr),
    // Last 30 days confirmed IDs — used to count active players
    supabase
      .from("reservations").select("id")
      .eq("club_id", club.id).eq("status", "confirmed")
      .gte("date", thirtyDaysAgoStr),
    // Club operating hours — for accurate occupancy calculation
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", club.id),
  ]);

  const weekCount = weekCountRes.count ?? 0;
  const monthCount = monthCountRes.count ?? 0;
  const courts = courtsRes.data ?? [];
  const memberCount = memberCountRes.count ?? 0;
  const upcoming = (upcomingRes.data ?? []) as unknown as UpcomingRow[];
  const recentCreated = (recentCreatedRes.data ?? []) as unknown as RecentRow[];
  const recentResIds = (thirtyDayResRes.data ?? []).map((r) => r.id);
  const creatorIds = [...new Set(recentCreated.map((r) => r.created_by).filter(Boolean))];

  // ─── Round 2: parallel (depend on round 1 results) ────────────────────────────
  const [activePlayersData, creatorProfilesData] = await Promise.all([
    recentResIds.length > 0
      ? supabase
          .from("reservation_players").select("profile_id")
          .in("reservation_id", recentResIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as Array<{ profile_id: string }>),
    creatorIds.length > 0
      ? supabase
          .from("profiles").select("id, full_name")
          .in("id", creatorIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as Array<{ id: string; full_name: string | null }>),
  ]);

  const activePlayerCount = new Set(activePlayersData.map((p) => p.profile_id)).size;
  const creatorMap = new Map(creatorProfilesData.map((p) => [p.id, p.full_name]));

  // ─── Operating hours + weekly availability ───────────────────────────────────
  const dbHours = (operatingHoursRes.data ?? []) as OperatingHour[];
  // Merge DB rows with defaults for any day not yet configured
  const effectiveHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => {
    const found = dbHours.find((h) => h.day_of_week === def.day_of_week);
    return found
      ? { day_of_week: found.day_of_week, is_open: found.is_open, opens_at: found.opens_at, closes_at: found.closes_at }
      : def;
  });
  // Mon(1) → Sat(6) → Sun(0)
  const weekDayNums = [1, 2, 3, 4, 5, 6, 0];
  const availableMinutesPerWeek = computeWeeklyAvailableMinutes(effectiveHours, weekDayNums);
  const availableHoursPerWeek = Math.round((availableMinutesPerWeek / 60) * 10) / 10;

  // ─── Court occupancy (this week) ─────────────────────────────────────────────
  const occupancyByCourtId = new Map<string, number>();
  for (const r of weekOccupancyRes.data ?? []) {
    occupancyByCourtId.set(r.court_id, (occupancyByCourtId.get(r.court_id) ?? 0) + r.duration_minutes);
  }
  const courtOccupancy = courts.map((c, i) => {
    const reserved = occupancyByCourtId.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      color: COURT_COLORS[i % COURT_COLORS.length],
      reservedHours: Math.round((reserved / 60) * 10) / 10,
      availableHours: availableHoursPerWeek,
      percentage:
        availableMinutesPerWeek > 0
          ? Math.min(100, Math.round((reserved / availableMinutesPerWeek) * 100))
          : 0,
    };
  });

  const isEmpty = recentCreated.length === 0;

  return (
    <div className="p-6 md:p-10">

      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-surface border border-white/10 p-6 mb-8">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--club-primary) 8%, transparent), color-mix(in srgb, var(--club-secondary) 8%, transparent))" }}
        />
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: "linear-gradient(to right, var(--club-primary), var(--club-secondary))" }}
        />
        <p className="text-sm text-brand-muted mb-0.5 relative">Panel del club</p>
        <h1 className="text-2xl font-bold text-white mb-5 relative">{club.name}</h1>
        <div className="flex flex-wrap gap-6 relative">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--club-primary)" }}>
              {courts.length}
            </span>
            <span className="text-sm text-brand-muted">canchas</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--club-secondary)" }}>
              {memberCount}
            </span>
            <span className="text-sm text-brand-muted">jugadores</span>
          </div>
        </div>
      </div>

      {isEmpty ? (
        /* ─── Empty state ────────────────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 bg-brand-surface border border-dashed border-white/10 rounded-2xl mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{ backgroundColor: "color-mix(in srgb, var(--club-primary) 12%, transparent)" }}
          >
            <CalendarDays className="w-8 h-8" style={{ color: "var(--club-primary)" }} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Aún no tienes reservas registradas</h2>
          <p className="text-sm text-brand-muted mb-8 max-w-sm">
            Registra la primera reserva de tu club para comenzar a ver métricas y estadísticas aquí.
          </p>
          <Link
            href={`/${slug}/admin/reservations/new`}
            className="inline-flex items-center gap-2 h-10 px-6 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{ backgroundColor: "var(--club-primary)", color: "var(--club-bg, #001A24)" }}
          >
            <Plus className="w-4 h-4" />
            Crear primera reserva
          </Link>
        </div>
      ) : (
        <>
          {/* ─── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {(
              [
                { label: "Reservas esta semana", value: weekCount, accent: "primary", Icon: CalendarDays },
                { label: "Reservas este mes", value: monthCount, accent: "secondary", Icon: CalendarDays },
                { label: "Jugadores activos", value: activePlayerCount, accent: "primary", Icon: Users, sub: "últimos 30 días" },
                { label: "Canchas activas", value: courts.length, accent: "secondary", Icon: Home },
              ] as const
            ).map(({ label, value, accent, Icon, ...rest }) => {
              const color = accent === "primary" ? "var(--club-primary)" : "var(--club-secondary)";
              const sub = "sub" in rest ? rest.sub : undefined;
              return (
                <div key={label} className="relative bg-brand-surface border border-white/10 rounded-2xl p-5 overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-0.5 opacity-70" style={{ backgroundColor: color }} />
                  <Icon className="absolute right-4 bottom-4 w-14 h-14 text-white opacity-[0.04]" />
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-brand-muted mb-0.5 leading-tight">{label}</p>
                  <p className="text-3xl font-bold text-white tabular-nums leading-none mb-1">{value}</p>
                  {sub && <p className="text-[11px] text-brand-muted/70">{sub}</p>}
                </div>
              );
            })}
          </div>

          {/* ─── Occupancy + Upcoming ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Court occupancy */}
            <div className="bg-brand-surface border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-white">Ocupación de canchas</h2>
                <span className="text-xs text-brand-muted">Esta semana</span>
              </div>
              {courtOccupancy.length === 0 ? (
                <p className="text-sm text-brand-muted text-center py-8">No hay canchas activas</p>
              ) : (
                <div className="flex flex-col gap-5">
                  {courtOccupancy.map((c) => (
                    <div key={c.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-white">{c.name}</span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: c.color }}>
                          {c.percentage}%
                        </span>
                      </div>
                      <div className="h-2 bg-white/[0.07] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${c.percentage > 0 ? Math.max(c.percentage, 2) : 0}%`,
                            backgroundColor: c.color,
                          }}
                        />
                      </div>
                      <p className="text-xs text-brand-muted/60 mt-1.5">
                        {c.reservedHours}h de {c.availableHours}h disponibles esta semana
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming reservations */}
            <div className="bg-brand-surface border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-white">Próximas reservas</h2>
                <Link
                  href={`/${slug}/admin/reservations`}
                  className="text-xs text-brand-muted hover:text-white transition-colors flex items-center gap-1"
                >
                  Ver todas
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-center text-center py-8 gap-3">
                  <p className="text-sm text-brand-muted">No hay reservas próximas</p>
                  <Link
                    href={`/${slug}/admin/reservations/new`}
                    className="text-xs font-medium hover:underline"
                    style={{ color: "var(--club-primary)" }}
                  >
                    Crear reserva
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {upcoming.map((r) => {
                    const players = r.reservation_players
                      .map((rp) => rp.profiles?.full_name)
                      .filter((n): n is string => !!n);
                    const playerSummary =
                      players.length === 0
                        ? null
                        : players.length <= 2
                        ? players.join(", ")
                        : `${players[0]} +${players.length - 1}`;

                    return (
                      <Link
                        key={r.id}
                        href={`/${slug}/admin/reservations/${r.id}`}
                        className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 transition-all"
                      >
                        <div className="text-center min-w-[44px] shrink-0">
                          <p className="text-[10px] text-brand-muted leading-tight">
                            {formatReservationDate(r.date, todayStr)}
                          </p>
                          <p className="text-sm font-bold text-white leading-snug">
                            {r.start_time.slice(0, 5)}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {r.courts?.name ?? "—"}
                          </p>
                          {playerSummary && (
                            <p className="text-xs text-brand-muted truncate">{playerSummary}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 text-brand-muted">
                          {TYPE_LABELS[r.type] ?? r.type}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ─── Recent activity ──────────────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Actividad reciente</h2>
              <span className="text-xs text-brand-muted">Últimas 10 creadas</span>
            </div>
            <div className="flex flex-col divide-y divide-white/[0.05]">
              {recentCreated.map((r) => (
                <Link
                  key={r.id}
                  href={`/${slug}/admin/reservations/${r.id}`}
                  className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-medium text-white truncate">
                        {r.courts?.name ?? "—"}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-brand-muted shrink-0">
                        {TYPE_LABELS[r.type] ?? r.type}
                      </span>
                      {r.status === "cancelled" && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 shrink-0">
                          Cancelada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brand-muted">
                      {r.date} · {r.start_time.slice(0, 5)} · {creatorMap.get(r.created_by) ?? "—"}
                    </p>
                  </div>
                  <p className="text-xs text-brand-muted/50 shrink-0 hidden sm:block whitespace-nowrap">
                    {formatCreatedAt(r.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── Quick access (always visible) ───────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          Acceso rápido
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              { label: "Reservaciones", Icon: CalendarDays, href: `/${slug}/admin/reservations`, color: "var(--club-primary)" },
              { label: "Canchas",        Icon: Home,         href: `/${slug}/admin/courts`,        color: "var(--club-secondary)" },
              { label: "Jugadores",      Icon: Users,        href: `/${slug}/admin/players`,       color: "var(--club-primary)" },
              { label: "Configuración",  Icon: Settings,     href: `/${slug}/admin`,               color: "var(--club-secondary)" },
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
                style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
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
