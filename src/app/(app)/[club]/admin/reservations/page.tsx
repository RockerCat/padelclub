import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WeekCalendar } from "./WeekCalendar";
import type { CalendarReservation, CalendarCourt, WeekDay } from "./WeekCalendar";
import { PendingRequestsSection } from "./PendingRequestsSection";
import type { PendingRequest } from "./PendingRequestsSection";
import { DEFAULT_OPERATING_HOURS } from "@/lib/operatingHours";
import { getClubDurations } from "@/lib/durations";

interface AdminReservationsPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ week?: string; updated?: string; cancelled?: string }>;
}

// ─── Date helpers (no timezone drift: always treat dates as local) ─────────────

function getWeekMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay(); // 0=Sun
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

const WEEKDAY = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminReservationsPage({
  params,
  searchParams,
}: AdminReservationsPageProps) {
  const { club: slug } = await params;
  const { week: weekParam, updated, cancelled } = await searchParams;
  const successMessage = updated ? "updated" : cancelled ? "cancelled" : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug, allowed_reservation_durations")
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
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    redirect(`/${slug}`);
  }

  // ─── Week range ─────────────────────────────────────────────────────────────
  const baseDate = weekParam ? new Date(`${weekParam}T00:00:00`) : new Date();
  const weekMonday = getWeekMonday(baseDate);
  const weekSunday = addDays(weekMonday, 6);
  const mondayStr = toDateStr(weekMonday);
  const sundayStr = toDateStr(weekSunday);
  const todayStr = toDateStr(new Date());

  // ─── Fetch courts + reservations in parallel ─────────────────────────────────
  type RawRow = {
    id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    type: string;
    title: string | null;
    court_id: string;
    courts: { name: string } | null;
    reservation_players: Array<{ profiles: { full_name: string | null } | null }>;
  };

  const [courtsRes, reservationsRes, operatingHoursRes, membersRes, pendingRes] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name, sort_order")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("reservations")
      .select(
        `id, date, start_time, duration_minutes, type, title, court_id,
         courts(name),
         reservation_players(profiles(full_name))`
      )
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", mondayStr)
      .lte("date", sundayStr),
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open")
      .eq("club_id", club.id),
    supabase
      .from("club_members")
      .select("profile_id, profiles!inner(full_name)")
      .eq("club_id", club.id)
      .eq("role", "PLAYER")
      .eq("is_active", true),
    supabase
      .from("reservations")
      .select("id, date, start_time, duration_minutes, court_id, created_by, courts(name)")
      .eq("club_id", club.id)
      .eq("status", "pending")
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  // ─── Pending requests: resolve player names ───────────────────────────────────
  type RawPending = {
    id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    court_id: string;
    created_by: string;
    courts: { name: string } | null;
  };
  const rawPending = (pendingRes.data ?? []) as unknown as RawPending[];
  const creatorIds = [...new Set(rawPending.map((r) => r.created_by))];
  const profilesData =
    creatorIds.length > 0
      ? (await supabase.from("profiles").select("id, full_name").in("id", creatorIds)).data ?? []
      : [];
  const profileMap = new Map(
    (profilesData as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name])
  );
  const pendingRequests: PendingRequest[] = rawPending.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    courtName: r.courts?.name ?? "—",
    playerName: profileMap.get(r.created_by) ?? null,
  }));

  const rawCourts = courtsRes.data ?? [];
  const rawRows = (reservationsRes.data ?? []) as unknown as RawRow[];
  const members = (membersRes.data ?? [])
    .map((m) => ({
      profile_id: m.profile_id,
      full_name: (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
    }))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "es"));

  // Compute closed days from effective operating hours (DB overrides defaults)
  const dbHours = operatingHoursRes.data ?? [];
  const closedDays = DEFAULT_OPERATING_HOURS.map((def) => {
    const found = dbHours.find((h) => h.day_of_week === def.day_of_week);
    return found ?? def;
  })
    .filter((h) => !h.is_open)
    .map((h) => h.day_of_week);

  // ─── Transform to calendar types ─────────────────────────────────────────────
  const allowedDurations = getClubDurations(
    (club as typeof club & { allowed_reservation_durations?: number[] })?.allowed_reservation_durations
  );

  const courts: CalendarCourt[] = rawCourts.map((c, i) => ({
    id: c.id,
    name: c.name,
    colorIndex: i,
  }));

  const reservations: CalendarReservation[] = rawRows.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    type: r.type,
    title: r.title,
    court_id: r.court_id,
    courtName: r.courts?.name ?? "—",
    players: r.reservation_players
      .map((rp) => rp.profiles?.full_name)
      .filter((n): n is string => !!n),
  }));

  // ─── Week metadata for the calendar ──────────────────────────────────────────
  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekMonday, i);
    return {
      date: toDateStr(d),
      dayName: WEEKDAY[i],
      dayNum: d.getDate(),
      monthName: MONTH[d.getMonth()],
    };
  });

  const weekLabel = `${weekMonday.getDate()} ${MONTH[weekMonday.getMonth()]} – ${weekSunday.getDate()} ${MONTH[weekSunday.getMonth()]}`;

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl font-bold text-white mb-6">Reservaciones</h1>
      <PendingRequestsSection requests={pendingRequests} clubId={club.id} clubSlug={slug} />
      <WeekCalendar
        weekDays={weekDays}
        weekLabel={weekLabel}
        reservations={reservations}
        courts={courts}
        members={members}
        prevWeekHref={`/${slug}/admin/reservations?week=${toDateStr(addDays(weekMonday, -7))}`}
        nextWeekHref={`/${slug}/admin/reservations?week=${toDateStr(addDays(weekMonday, 7))}`}
        todayStr={todayStr}
        clubSlug={slug}
        clubId={club.id}
        allowedDurations={allowedDurations}
        successMessage={successMessage}
        closedDays={closedDays}
      />
    </div>
  );
}
