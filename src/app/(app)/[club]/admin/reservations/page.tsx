import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CalendarReservation, CalendarCourt, WeekDay } from "./WeekCalendar";
import { PendingRequestsSection } from "./PendingRequestsSection";
import type { PendingRequest } from "./PendingRequestsSection";
import type { RejectedReservation } from "./RejectedReservationsSection";
import { ReservationsViewSwitcher } from "./ReservationsViewSwitcher";
import { DEFAULT_OPERATING_HOURS } from "@/lib/operatingHours";
import type { OperatingHour } from "@/lib/operatingHours";
import { getClubDurations } from "@/lib/durations";
import { computeAvailability } from "@/lib/courtDayAvailability";
import type { RawReservation } from "@/lib/courtDayAvailability";
import type { DayRangeBlock, DayRangeDay } from "@/components/courts/DayRangeNav";

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
    .select("id, name, slug, allowed_reservation_durations, archived_at")
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

  // ─── Week range (Semana view — unchanged) ─────────────────────────────────────
  const baseDate = weekParam ? new Date(`${weekParam}T00:00:00`) : new Date();
  const weekMonday = getWeekMonday(baseDate);
  const weekSunday = addDays(weekMonday, 6);
  const mondayStr = toDateStr(weekMonday);
  const now = new Date();
  const todayStr = toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // ─── Day range (Agenda view) ──────────────────────────────────────────────────
  // Same pattern the player Reservations page already uses: an explicit
  // `week` param (from Agenda's own 7/10/14-day prev/next links below) is
  // trusted as an exact date, never re-snapped to Monday, so each
  // breakpoint's arrows can advance by exactly their own block size without
  // drifting. With no explicit param, falls back to the Monday of today —
  // exactly Semana's own default, so both views agree on first load.
  // weekMonday <= agendaAnchorStart always (Monday-of-X floors X), so this
  // superset's end always covers Semana's own window too — the confirmed-
  // reservations query below only needs its upper bound widened.
  const DAY_RANGE_MAX = 14;
  const agendaAnchorStart = weekParam ? new Date(`${weekParam}T00:00:00`) : getWeekMonday(now);
  const agendaRangeEndStr = toDateStr(addDays(agendaAnchorStart, DAY_RANGE_MAX - 1));

  // ─── Fetch courts + reservations in parallel ─────────────────────────────────
  type RawRow = {
    id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    type: string;
    title: string | null;
    court_id: string;
    // Never rendered as a player — only used to recognize a reservation
    // that came from the requester's own approved request (no explicit
    // reservation_players row for them) vs one an OWNER/ADMIN created
    // directly. See effectivePlayersFor in AdminAvailabilityView.
    created_by: string;
    courts: { name: string } | null;
    reservation_players: Array<{ profiles: { full_name: string | null } | null }>;
  };

  const [courtsRes, reservationsRes, operatingHoursRes, membersRes, pendingRes, rejectedRes] = await Promise.all([
    supabase
      .from("courts")
      .select("id, name, sort_order")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("reservations")
      .select(
        `id, date, start_time, duration_minutes, type, title, court_id, created_by,
         courts(name),
         reservation_players(profiles(full_name))`
      )
      .eq("club_id", club.id)
      .eq("status", "confirmed")
      .gte("date", mondayStr)
      // Upper bound covers both Semana's own week AND Agenda's wider
      // day-range superset (weekMonday <= agendaAnchorStart always, see
      // above) — one widened range query, not a second one.
      .lte("date", agendaRangeEndStr),
    supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", club.id),
    supabase
      .from("club_members")
      .select("profile_id, profiles!inner(full_name, avatar_url)")
      .eq("club_id", club.id)
      .eq("role", "PLAYER")
      .eq("is_active", true),
    supabase
      .from("reservations")
      .select("id, date, start_time, duration_minutes, court_id, created_by, price_amount, price_currency, courts(name)")
      .eq("club_id", club.id)
      .eq("status", "pending")
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true }),
    // Historial de rechazadas (RejectedReservationsSection) — trae hasta las
    // últimas 100, más recientes primero; el filtro de periodo del
    // componente (30/90 días / todo) se aplica client-side sobre este mismo
    // conjunto, sin consultas adicionales por cada cambio de filtro.
    supabase
      .from("reservations")
      .select(
        "id, date, start_time, duration_minutes, court_id, created_by, price_amount, price_currency, rejection_reason, rejected_at, rejected_by, courts(name)"
      )
      .eq("club_id", club.id)
      .eq("status", "rejected")
      .order("rejected_at", { ascending: false })
      .limit(100),
  ]);

  // ─── Pending + rejected: resolve player/admin names ──────────────────────────
  type RawPending = {
    id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    court_id: string;
    created_by: string;
    price_amount: number | null;
    price_currency: string | null;
    courts: { name: string } | null;
  };
  type RawRejected = {
    id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    court_id: string;
    created_by: string;
    price_amount: number | null;
    price_currency: string | null;
    rejection_reason: string | null;
    rejected_at: string | null;
    rejected_by: string | null;
    courts: { name: string } | null;
  };
  const rawPending = (pendingRes.data ?? []) as unknown as RawPending[];
  const rawRejected = (rejectedRes.data ?? []) as unknown as RawRejected[];

  // One batched profiles fetch covers every name this page needs: pending
  // requesters, rejected requesters, and the admins who rejected them.
  const profileIds = [
    ...new Set([
      ...rawPending.map((r) => r.created_by),
      ...rawRejected.map((r) => r.created_by),
      ...rawRejected.map((r) => r.rejected_by).filter((id): id is string => !!id),
    ]),
  ];
  const profilesData =
    profileIds.length > 0
      ? (await supabase.from("profiles").select("id, full_name").in("id", profileIds)).data ?? []
      : [];
  const profileMap = new Map(
    (profilesData as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name])
  );
  const pendingRequests: PendingRequest[] = rawPending.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    court_id: r.court_id,
    courtName: r.courts?.name ?? "—",
    playerId: r.created_by,
    playerName: profileMap.get(r.created_by) ?? null,
    price_amount: r.price_amount,
    price_currency: r.price_currency,
  }));
  const rejectedReservations: RejectedReservation[] = rawRejected.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    courtName: r.courts?.name ?? "—",
    playerName: profileMap.get(r.created_by) ?? null,
    price_amount: r.price_amount,
    price_currency: r.price_currency,
    rejection_reason: r.rejection_reason,
    rejected_at: r.rejected_at,
    rejectedByName: r.rejected_by ? profileMap.get(r.rejected_by) ?? null : null,
  }));

  const rawCourts = courtsRes.data ?? [];
  const rawRows = (reservationsRes.data ?? []) as unknown as RawRow[];
  const members = (membersRes.data ?? [])
    .map((m) => ({
      profile_id: m.profile_id,
      full_name: (m.profiles as { full_name: string | null; avatar_url: string | null } | null)?.full_name ?? null,
      avatar_url: (m.profiles as { full_name: string | null; avatar_url: string | null } | null)?.avatar_url ?? null,
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
    created_by: r.created_by,
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
  const prevWeekHref = `/${slug}/admin/reservations?week=${toDateStr(addDays(weekMonday, -7))}`;
  const nextWeekHref = `/${slug}/admin/reservations?week=${toDateStr(addDays(weekMonday, 7))}`;
  const todayHref = `/${slug}/admin/reservations`;

  // ─── Agenda day range + availability ──────────────────────────────────────────
  // Same underlying occupancy rule as the player Reservations page
  // (confirmed + pending both block a slot) — built entirely from data this
  // page already fetched above (rawRows, rawPending; the confirmed query's
  // range was widened above), no extra query. Agenda still only ever
  // renders one selected day at a time (client-side) — this superset exists
  // so any of the 7/10/14 selectable days already has real availability
  // data, not so all of them load simultaneously.
  const agendaWeekDates = Array.from({ length: DAY_RANGE_MAX }, (_, i) => toDateStr(addDays(agendaAnchorStart, i)));
  const agendaWeekDays: DayRangeDay[] = agendaWeekDates.map((date, i) => {
    const d = addDays(agendaAnchorStart, i);
    // Date-driven, not index-driven: once a variant's arrows can land
    // agendaAnchorStart on any weekday (10/14-day steps aren't week
    // multiples), `i` no longer reliably means "Monday" for i=0.
    const mondayIndexedDay = (d.getDay() + 6) % 7; // getDay(): 0=Sun..6=Sat → 0=Mon..6=Sun
    return {
      date,
      dayName: WEEKDAY[mondayIndexedDay],
      dayNum: d.getDate(),
      monthName: MONTH[d.getMonth()],
      isPast: date < todayStr,
    };
  });

  // "20 jul – 26 jul" — reads month/day independently off each endpoint, so
  // a range crossing a month or year boundary formats correctly with no
  // special-casing. Same helper the player Reservations page uses.
  function formatRangeLabel(start: Date, end: Date): string {
    return `${start.getDate()} ${MONTH[start.getMonth()]} – ${end.getDate()} ${MONTH[end.getMonth()]}`;
  }

  // One block per breakpoint (see DayRangeBlock/DayRangeNav,
  // @/components/courts/DayRangeNav) — className is the only thing
  // deciding which is visible at a given viewport; each steps by exactly
  // its own day count from the same shared anchor. Exact same
  // count/variant/className pattern as the player Reservations page.
  const dayRangeBlocks: DayRangeBlock[] = [
    {
      count: 7,
      variant: "scroll",
      className: "flex flex-col gap-4 xl:hidden",
      label: formatRangeLabel(agendaAnchorStart, addDays(agendaAnchorStart, 6)),
      prevHref: `/${slug}/admin/reservations?week=${toDateStr(addDays(agendaAnchorStart, -7))}`,
      nextHref: `/${slug}/admin/reservations?week=${toDateStr(addDays(agendaAnchorStart, 7))}`,
    },
    {
      count: 10,
      variant: "grid",
      className: "hidden xl:flex xl:flex-col xl:gap-4 2xl:hidden",
      label: formatRangeLabel(agendaAnchorStart, addDays(agendaAnchorStart, 9)),
      prevHref: `/${slug}/admin/reservations?week=${toDateStr(addDays(agendaAnchorStart, -10))}`,
      nextHref: `/${slug}/admin/reservations?week=${toDateStr(addDays(agendaAnchorStart, 10))}`,
    },
    {
      count: 14,
      variant: "grid",
      className: "hidden 2xl:flex 2xl:flex-col 2xl:gap-4",
      label: formatRangeLabel(agendaAnchorStart, addDays(agendaAnchorStart, 13)),
      prevHref: `/${slug}/admin/reservations?week=${toDateStr(addDays(agendaAnchorStart, -14))}`,
      nextHref: `/${slug}/admin/reservations?week=${toDateStr(addDays(agendaAnchorStart, 14))}`,
    },
  ];

  const opHours = dbHours as OperatingHour[];
  const minDuration = Math.min(...allowedDurations);
  const reservationsForAvailability: RawReservation[] = [
    ...rawRows.map((r) => ({
      court_id: r.court_id,
      date: r.date,
      start_time: r.start_time,
      duration_minutes: r.duration_minutes,
    })),
    ...rawPending
      .filter((p) => p.date >= mondayStr && p.date <= agendaRangeEndStr)
      .map((p) => ({
        court_id: p.court_id,
        date: p.date,
        start_time: p.start_time,
        duration_minutes: p.duration_minutes,
      })),
  ];
  const { availability, closedDates, openingMinsByDate, closingMinsByDate } = computeAvailability(
    courts,
    agendaWeekDates,
    opHours,
    reservationsForAvailability,
    todayStr,
    nowMins,
    minDuration,
  );

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl font-bold text-white mb-6">Reservaciones</h1>
      <PendingRequestsSection requests={pendingRequests} clubId={club.id} clubSlug={slug} />
      <ReservationsViewSwitcher
        weekCalendarProps={{
          weekDays,
          weekLabel,
          reservations,
          courts,
          members,
          prevWeekHref,
          nextWeekHref,
          todayStr,
          clubSlug: slug,
          clubId: club.id,
          allowedDurations,
          successMessage,
          closedDays,
          archived: !!club.archived_at,
        }}
        availabilityProps={{
          weekDays: agendaWeekDays,
          dayRangeBlocks,
          todayHref,
          todayStr,
          courts,
          reservations,
          pendingRequests,
          members,
          clubId: club.id,
          clubSlug: slug,
          allowedDurations,
          availability,
          openingMinsByDate,
          closingMinsByDate,
          closedDates,
          minDuration,
          rejectedReservations,
          archived: !!club.archived_at,
        }}
      />
    </div>
  );
}
