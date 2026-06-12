import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WeekCalendar } from "./WeekCalendar";
import type { CalendarReservation, CalendarCourt, WeekDay } from "./WeekCalendar";

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
    .select("id, name, slug")
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

  const [courtsRes, reservationsRes] = await Promise.all([
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
  ]);

  const rawCourts = courtsRes.data ?? [];
  const rawRows = (reservationsRes.data ?? []) as unknown as RawRow[];

  // ─── Transform to calendar types ─────────────────────────────────────────────
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

  const todayStr = toDateStr(new Date());

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl font-bold text-white mb-6">Reservaciones</h1>
      <WeekCalendar
        weekDays={weekDays}
        weekLabel={weekLabel}
        reservations={reservations}
        courts={courts}
        prevWeekHref={`/${slug}/admin/reservations?week=${toDateStr(addDays(weekMonday, -7))}`}
        nextWeekHref={`/${slug}/admin/reservations?week=${toDateStr(addDays(weekMonday, 7))}`}
        todayStr={todayStr}
        clubSlug={slug}
        clubId={club.id}
        successMessage={successMessage}
      />
    </div>
  );
}
