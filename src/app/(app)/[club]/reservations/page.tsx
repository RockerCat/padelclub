import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveHour, timeToMinutes } from "@/lib/operatingHours";
import type { OperatingHour } from "@/lib/operatingHours";
import { PlayerAvailabilityCalendar } from "./PlayerAvailabilityCalendar";
import { getClubDurations } from "@/lib/durations";

interface PlayerReservationsPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ week?: string }>;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getWeekMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const WEEKDAY = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// ─── Availability computation ─────────────────────────────────────────────────

type RawReservation = {
  court_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
};

export type MyReservation = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  status: "pending" | "confirmed" | "cancelled";
  court_id: string;
  courtName: string;
};

// Blocked windows per date per court: [startMins, endMins][]
type BlockedByDate = Record<string, Record<string, Array<[number, number]>>>;

function computeAvailability(
  courts: Array<{ id: string }>,
  weekDates: string[],
  opHours: OperatingHour[],
  reservations: RawReservation[],
  todayStr: string,
  nowMins: number,
  minDuration: number, // smallest allowed duration → base slot filter
): {
  availability: Record<string, Record<string, string[]>>;
  closedDates: string[];
  closingMinsByDate: Record<string, number>;
  blockedByDate: BlockedByDate;
} {
  const availability: Record<string, Record<string, string[]>> = {};
  const closedDates: string[] = [];
  const closingMinsByDate: Record<string, number> = {};
  const blockedByDate: BlockedByDate = {};

  for (const date of weekDates) {
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    const hours = getEffectiveHour(opHours, dayOfWeek);
    availability[date] = {};
    blockedByDate[date] = {};

    if (!hours.is_open || !hours.opens_at || !hours.closes_at) {
      closedDates.push(date);
      for (const court of courts) {
        availability[date][court.id] = [];
        blockedByDate[date][court.id] = [];
      }
      continue;
    }

    const openMins = timeToMinutes(hours.opens_at);
    const closeMins = timeToMinutes(hours.closes_at);
    closingMinsByDate[date] = closeMins;

    // Base slots: 30-min aligned, fit the minimum allowed duration before close
    const baseSlots: string[] = [];
    for (let t = openMins; t + minDuration <= closeMins; t += 30) {
      baseSlots.push(minsToTime(t));
    }

    const futureSlots =
      date === todayStr
        ? baseSlots.filter((s) => timeToMinutes(s) > nowMins)
        : baseSlots;

    for (const court of courts) {
      const courtRes = reservations.filter(
        (r) => r.court_id === court.id && r.date === date,
      );

      // Store blocked windows for client-side duration filtering
      blockedByDate[date][court.id] = courtRes.map((r) => {
        const rStart = timeToMinutes(r.start_time);
        return [rStart, rStart + r.duration_minutes] as [number, number];
      });

      // Default available slots (blocked if start falls inside any reservation)
      availability[date][court.id] = futureSlots.filter((slot) => {
        const slotMins = timeToMinutes(slot);
        return !courtRes.some((r) => {
          const rStart = timeToMinutes(r.start_time);
          const rEnd = rStart + r.duration_minutes;
          return slotMins >= rStart && slotMins < rEnd;
        });
      });
    }
  }

  return { availability, closedDates, closingMinsByDate, blockedByDate };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PlayerReservationsPage({
  params,
  searchParams,
}: PlayerReservationsPageProps) {
  const { club: slug } = await params;
  const { week: weekParam } = await searchParams;

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
  if (!membership) redirect("/unauthorized");

  // ─── Week range ─────────────────────────────────────────────────────────────
  const baseDate = weekParam ? new Date(`${weekParam}T00:00:00`) : new Date();
  const weekMonday = getWeekMonday(baseDate);
  const weekSunday = addDays(weekMonday, 6);
  const mondayStr = toDateStr(weekMonday);
  const sundayStr = toDateStr(weekSunday);

  // ─── Week metadata (needed for queries below) ────────────────────────────────
  const now = new Date();
  const todayStr = toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // ─── Fetch data in parallel ───────────────────────────────────────────────────
  // Privacy-safe: no player names, titles, notes in any of these queries.
  // Blocking query includes CONFIRMED + PENDING so occupied slots are hidden correctly.
  const [courtsRes, reservationsRes, opHoursRes, myReservationsRes] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("reservations")
      .select("court_id, date, start_time, duration_minutes")
      .eq("club_id", club.id)
      .in("status", ["confirmed", "pending"])
      .gte("date", mondayStr)
      .lte("date", sundayStr),
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", club.id),
    supabase
      .from("reservations")
      .select("id, date, start_time, duration_minutes, status, court_id, courts(name)")
      .eq("club_id", club.id)
      .eq("created_by", user.id)
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(30),
  ]);

  const courts = courtsRes.data ?? [];
  const reservations = (reservationsRes.data ?? []) as RawReservation[];
  const opHours = (opHoursRes.data ?? []) as OperatingHour[];

  type RawMyRow = {
    id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    status: string;
    court_id: string;
    courts: { name: string } | null;
  };
  const myReservations: MyReservation[] = ((myReservationsRes.data ?? []) as unknown as RawMyRow[]).map(
    (r) => ({
      id: r.id,
      date: r.date,
      start_time: r.start_time,
      duration_minutes: r.duration_minutes,
      status: r.status as MyReservation["status"],
      court_id: r.court_id,
      courtName: r.courts?.name ?? "—",
    })
  );

  // ─── Week metadata ────────────────────────────────────────────────────────────
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    toDateStr(addDays(weekMonday, i)),
  );

  const weekDays = weekDates.map((date, i) => {
    const d = addDays(weekMonday, i);
    return {
      date,
      dayName: WEEKDAY[i],
      dayNum: d.getDate(),
      monthName: MONTH[d.getMonth()],
      isPast: date < todayStr,
    };
  });

  const weekLabel = `${weekMonday.getDate()} ${MONTH[weekMonday.getMonth()]} – ${weekSunday.getDate()} ${MONTH[weekSunday.getMonth()]}`;

  const allowedDurations = getClubDurations(
    (club as typeof club & { allowed_reservation_durations?: number[] })?.allowed_reservation_durations
  );
  const minDuration = Math.min(...allowedDurations);

  // ─── Compute availability ─────────────────────────────────────────────────────
  const { availability, closedDates, closingMinsByDate, blockedByDate } = computeAvailability(
    courts,
    weekDates,
    opHours,
    reservations,
    todayStr,
    nowMins,
    minDuration,
  );

  const defaultSelectedDate = weekDays.some((d) => d.date === todayStr)
    ? todayStr
    : weekDays[0].date;

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Disponibilidad</h1>
        <p className="text-sm text-brand-muted mt-1">{club.name}</p>
      </div>

      {courts.length === 0 ? (
        <p className="text-sm text-brand-muted">
          El club aún no tiene canchas configuradas.
        </p>
      ) : (
        <PlayerAvailabilityCalendar
          weekDays={weekDays}
          courts={courts}
          availability={availability}
          closedDates={closedDates}
          todayStr={todayStr}
          weekLabel={weekLabel}
          prevWeekHref={`/${slug}/reservations?week=${toDateStr(addDays(weekMonday, -7))}`}
          nextWeekHref={`/${slug}/reservations?week=${toDateStr(addDays(weekMonday, 7))}`}
          todayHref={`/${slug}/reservations`}
          clubId={club.id}
          defaultSelectedDate={defaultSelectedDate}
          allowedDurations={allowedDurations}
          closingMinsByDate={closingMinsByDate}
          blockedByDate={blockedByDate}
          myReservations={myReservations}
        />
      )}
    </div>
  );
}
