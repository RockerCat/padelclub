import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerAvailabilityCalendar } from "./PlayerAvailabilityCalendar";
import type { DayRangeBlock } from "@/components/courts/DayRangeNav";
import { getClubDurations } from "@/lib/durations";
import { getPlayerReservations, toMyReservation } from "@/lib/playerReservations";
import type { MyReservation, RawReservationRow } from "@/lib/playerReservations";
import { computeAvailability } from "@/lib/courtDayAvailability";
import type { RawReservation } from "@/lib/courtDayAvailability";
import type { OperatingHour } from "@/lib/operatingHours";

interface PlayerReservationsPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{
    week?: string;
    // Identifies which of the player's own reservations the activity panel
    // (ReservationsActivityPanel in PlayerAvailabilityCalendar.tsx) should
    // treat as selected — set either by clicking an activity card (same
    // page, client-side navigation) or by the "Solicitud rechazada"/other
    // notification hrefs (hrefForNotification in @/lib/notifications). The
    // single source for both "which week/court/duration context to switch
    // the calendar to" and "which slot to visually highlight" — one
    // mechanism, not two. Re-validated server-side below: must belong to
    // this player, this club, and be one of the panel's supported statuses
    // — never trusted as-is.
    reservationId?: string;
    // Set by the "Editar reserva" action (PlayerActivity.tsx) alongside
    // reservationId — purely a UI-mode switch (which slot-click behavior
    // to wire up), re-validated server-side below (creator-only,
    // pending/confirmed, 2+ hours out) purely for SHOW/HIDE of the edit
    // affordance; update_reservation (SECURITY DEFINER) is the real
    // authority and re-checks everything again regardless of this flag.
    edit?: string;
  }>;
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

const WEEKDAY = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "20 jul – 26 jul" — reads month/day independently off each endpoint, so
// a range crossing a month or year boundary formats correctly with no
// special-casing.
function formatRangeLabel(start: Date, end: Date): string {
  return `${start.getDate()} ${MONTH[start.getMonth()]} – ${end.getDate()} ${MONTH[end.getMonth()]}`;
}

// Same UI-only gate PlayerActivity.tsx's "Editar reserva" button already
// applies (creator-only, pending/confirmed, 2+ hours out) — real
// enforcement is update_reservation's job, not this page's. Duplicated
// here (rather than imported from a "use client" module) as a small, pure
// local check, matching this codebase's existing convention of small
// per-file time helpers (e.g. checkNotInPast in admin/reservations/
// actions.ts) rather than a shared abstraction for a 3-line computation.
function isEditableByPlayer(r: MyReservation, userId: string): boolean {
  if (r.created_by !== userId) return false;
  if (r.status !== "pending" && r.status !== "confirmed") return false;
  const startDate = new Date(`${r.date}T${r.start_time.slice(0, 5)}:00`);
  return startDate.getTime() - Date.now() >= 2 * 60 * 60 * 1000;
}

// MyReservation/RawReservationRow/toMyReservation now live in
// @/lib/playerReservations, shared with the player home page; RawReservation
// and computeAvailability now live in @/lib/courtDayAvailability, shared
// with the OWNER/ADMIN "Disponibilidad" view — no second implementation of
// either.

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PlayerReservationsPage({
  params,
  searchParams,
}: PlayerReservationsPageProps) {
  const { club: slug } = await params;
  const { week: weekParam, reservationId, edit } = await searchParams;

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
  if (!membership) redirect("/unauthorized");

  // ─── Week metadata (needed before the week range below) ──────────────────────
  const now = new Date();
  const todayStr = toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // ─── Focused reservation (activity-panel selection / notification link) ──────
  // Fetched ahead of the week-range/availability batch below because its
  // date decides which week to load. Never trusts reservationId as-is —
  // must look like a real UUID before it even reaches a query. Belonging to
  // this club and being one of the panel's 3 supported statuses is enforced
  // by the query itself; belonging to THIS player is verified explicitly
  // below — either as the requester (created_by, self-requested-then-
  // resolved) or as a participant (reservation_players, an OWNER/ADMIN
  // added them directly) — the same two sources "Mis reservas" is built
  // from, so clicking any card there resolves correctly too.
  const isValidReservationId =
    !!reservationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId);

  const { data: rawFocusCandidate } = isValidReservationId
    ? await supabase
        .from("reservations")
        .select(
          "id, date, start_time, duration_minutes, status, court_id, created_by, price_amount, price_currency, rejection_reason, rejected_at, courts(name)"
        )
        .eq("id", reservationId!)
        .eq("club_id", club.id)
        .in("status", ["pending", "confirmed", "rejected"])
        .maybeSingle()
    : { data: null };

  const rawFocusRow = rawFocusCandidate as RawReservationRow | null;
  let focusReservation: MyReservation | null = null;
  if (rawFocusRow) {
    const isOwnRequest = rawFocusRow.created_by === user.id;
    let isParticipant = isOwnRequest;
    if (!isParticipant) {
      const { data: participantRow } = await supabase
        .from("reservation_players")
        .select("profile_id")
        .eq("reservation_id", rawFocusRow.id)
        .eq("profile_id", user.id)
        .maybeSingle();
      isParticipant = !!participantRow;
    }
    if (isParticipant) {
      focusReservation = toMyReservation(rawFocusRow);
    }
  }

  // A focus date in the past is never trusted to steer week navigation —
  // falls back to today's week exactly as if no reservationId were present.
  const validFocusDate = focusReservation && focusReservation.date >= todayStr ? focusReservation.date : undefined;

  // "Editar reserva" mode — only when explicitly requested (edit=1) AND
  // the focused reservation genuinely qualifies right now (creator, still
  // pending/confirmed, 2+ hours out). Falls back to plain view/select mode
  // otherwise, never a broken/half-editing state.
  const editingReservation =
    edit === "1" && focusReservation && isEditableByPlayer(focusReservation, user.id) ? focusReservation : null;

  // ─── Day range ──────────────────────────────────────────────────────────────
  // anchorStart is the first visible day, shared by all three desktop/mobile
  // day-count variants (see DayRangeBlock below) — each just shows a longer
  // or shorter prefix starting from the same date. An explicit `week` param
  // always comes from one of this page's own prev/next links (7/10/14-day
  // steps) and is trusted as an exact date, never re-snapped to Monday, so
  // each variant's arrows can advance by exactly their own block size
  // without drifting. With no explicit param, falls back to the Monday of
  // the focused reservation's week (validFocusDate) or of today — exactly
  // the previous single-week default.
  const DAY_RANGE_MAX = 14; // superset fetched once; each variant below shows a prefix of it
  const anchorStart = weekParam
    ? new Date(`${weekParam}T00:00:00`)
    : getWeekMonday(validFocusDate ? new Date(`${validFocusDate}T00:00:00`) : now);
  const rangeStartStr = toDateStr(anchorStart);
  const rangeEndStr = toDateStr(addDays(anchorStart, DAY_RANGE_MAX - 1));

  // ─── Fetch data in parallel ───────────────────────────────────────────────────
  // Privacy-safe: no player names, titles, notes in any of these queries.
  // Blocking query includes CONFIRMED + PENDING so occupied slots are hidden
  // correctly. myReservations/myBookings come from the shared
  // getPlayerReservations helper (@/lib/playerReservations, also used by the
  // player home page) — run alongside the other three so nothing loses
  // parallelism from being pulled out into its own function.
  const [[courtsRes, reservationsRes, opHoursRes], { myReservations, myBookings }] = await Promise.all([
    Promise.all([
      supabase
        .from("courts")
        .select("id, name, surface, is_indoor")
        .eq("club_id", club.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("reservations")
        .select("id, court_id, date, start_time, duration_minutes")
        .eq("club_id", club.id)
        .in("status", ["confirmed", "pending"])
        .gte("date", rangeStartStr)
        .lte("date", rangeEndStr),
      supabase
        .from("club_operating_hours")
        .select("day_of_week, is_open, opens_at, closes_at")
        .eq("club_id", club.id),
    ]),
    getPlayerReservations(supabase, club.id, user.id, todayStr),
  ]);

  const courts = courtsRes.data ?? [];
  // Edit mode only: excludes the reservation being edited from the
  // occupancy grid, so its own current slot doesn't read as "occupied"
  // while picking its new one — the RPC (update_reservation) is the real
  // authority and already excludes this same row server-side regardless.
  // Create mode (editingReservation === null) is completely untouched.
  const rawReservations = (reservationsRes.data ?? []) as (RawReservation & { id: string })[];
  const reservations = editingReservation
    ? rawReservations.filter((r) => r.id !== editingReservation.id)
    : rawReservations;
  const opHours = (opHoursRes.data ?? []) as OperatingHour[];

  // ─── Day range metadata ───────────────────────────────────────────────────────
  const weekDates = Array.from({ length: DAY_RANGE_MAX }, (_, i) =>
    toDateStr(addDays(anchorStart, i)),
  );

  const weekDays = weekDates.map((date, i) => {
    const d = addDays(anchorStart, i);
    // Date-driven, not index-driven: once a variant's arrows can land
    // anchorStart on any weekday (10/14-day steps aren't week multiples),
    // `i` no longer reliably means "Monday" for i=0.
    const mondayIndexedDay = (d.getDay() + 6) % 7; // getDay(): 0=Sun..6=Sat → 0=Mon..6=Sun
    return {
      date,
      dayName: WEEKDAY[mondayIndexedDay],
      dayNum: d.getDate(),
      monthName: MONTH[d.getMonth()],
      isPast: date < todayStr,
    };
  });

  // One block per breakpoint (see DayRangeBlock/DayRangeNav in
  // PlayerAvailabilityCalendar.tsx) — className is the only thing deciding
  // which is visible at a given viewport; each steps by exactly its own
  // day count from the same shared anchor.
  const dayRangeBlocks: DayRangeBlock[] = [
    {
      count: 7,
      variant: "scroll",
      className: "flex flex-col gap-4 xl:hidden",
      label: formatRangeLabel(anchorStart, addDays(anchorStart, 6)),
      prevHref: `/${slug}/reservations?week=${toDateStr(addDays(anchorStart, -7))}`,
      nextHref: `/${slug}/reservations?week=${toDateStr(addDays(anchorStart, 7))}`,
    },
    {
      count: 10,
      variant: "grid",
      className: "hidden xl:flex xl:flex-col xl:gap-4 2xl:hidden",
      label: formatRangeLabel(anchorStart, addDays(anchorStart, 9)),
      prevHref: `/${slug}/reservations?week=${toDateStr(addDays(anchorStart, -10))}`,
      nextHref: `/${slug}/reservations?week=${toDateStr(addDays(anchorStart, 10))}`,
    },
    {
      count: 14,
      variant: "grid",
      className: "hidden 2xl:flex 2xl:flex-col 2xl:gap-4",
      label: formatRangeLabel(anchorStart, addDays(anchorStart, 13)),
      prevHref: `/${slug}/reservations?week=${toDateStr(addDays(anchorStart, -14))}`,
      nextHref: `/${slug}/reservations?week=${toDateStr(addDays(anchorStart, 14))}`,
    },
  ];

  const allowedDurations = getClubDurations(
    (club as typeof club & { allowed_reservation_durations?: number[] })?.allowed_reservation_durations
  );
  const minDuration = Math.min(...allowedDurations);

  // ─── Compute availability ─────────────────────────────────────────────────────
  const { availability, closedDates, openingMinsByDate, closingMinsByDate, blockedByDate } = computeAvailability(
    courts,
    weekDates,
    opHours,
    reservations,
    todayStr,
    nowMins,
    minDuration,
  );

  // Re-validates the focused reservation's court/duration independently —
  // never drops the whole context just because ONE piece (the court went
  // inactive, or the club dropped that duration) stopped being valid; the
  // other still applies. Deliberately carries no hour: clicking an activity
  // card must never preselect a time, only switch the calendar's
  // date/court/duration context.
  const prefillCourtId =
    focusReservation && courts.some((c) => c.id === focusReservation.court_id) ? focusReservation.court_id : null;
  const prefillDuration =
    focusReservation && allowedDurations.includes(focusReservation.duration_minutes)
      ? focusReservation.duration_minutes
      : null;
  const prefill = focusReservation ? { courtId: prefillCourtId, duration: prefillDuration } : null;

  // Date is resolved independently of court/duration validity — a focused
  // reservation's date always wins here even if its court or duration no
  // longer qualify; a past date is never selected (validFocusDate is
  // already guaranteed non-past above).
  const defaultSelectedDate =
    validFocusDate && weekDays.some((d) => d.date === validFocusDate)
      ? validFocusDate
      : weekDays.some((d) => d.date === todayStr)
      ? todayStr
      : weekDays[0].date;

  return (
    // max-w-7xl (up from max-w-6xl): the calendar's own main column is
    // flex-1 (see PlayerAvailabilityCalendar's lg:flex-row split) and
    // already stretches to fill whatever width this container gives it —
    // 6xl was narrow enough that a single-court card, combined with the
    // fixed-width side panel, left a wide empty strip between them on
    // common desktop viewports. Widened further at xl/2xl so the 10- and
    // 14-day blocks (DayRangeBlock below) actually have the extra room
    // they're meant to use — otherwise this cap alone would erase the
    // point of showing more days on wide screens.
    <div className="p-6 md:p-10 max-w-7xl xl:max-w-[1560px] 2xl:max-w-[1820px]">
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
          dayRangeBlocks={dayRangeBlocks}
          todayHref={`/${slug}/reservations`}
          clubId={club.id}
          clubSlug={slug}
          playerId={user.id}
          defaultSelectedDate={defaultSelectedDate}
          allowedDurations={allowedDurations}
          openingMinsByDate={openingMinsByDate}
          closingMinsByDate={closingMinsByDate}
          blockedByDate={blockedByDate}
          myReservations={myReservations}
          myBookings={myBookings}
          prefill={prefill}
          focusReservation={focusReservation}
          archived={!!club.archived_at}
          editingReservation={editingReservation}
        />
      )}
    </div>
  );
}
