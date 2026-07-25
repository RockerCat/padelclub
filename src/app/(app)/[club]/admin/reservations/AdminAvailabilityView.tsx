"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { AvailabilityLegend, CourtAvailabilityCard } from "@/components/courts/CourtAvailabilityTimeline";
import type { ContextRange } from "@/components/courts/CourtAvailabilityTimeline";
import { DayRangeNav } from "@/components/courts/DayRangeNav";
import type { DayRangeBlock, DayRangeDay } from "@/components/courts/DayRangeNav";
import { timeToMins, addMinutes, buildDayGrid } from "@/lib/courtAvailability";
import { ReservationTicketPanel, TYPE_LABELS } from "./ReservationTicketPanel";
import type { TicketPanelState } from "./ReservationTicketPanel";
import type { CalendarReservation, CalendarCourt } from "./WeekCalendar";
import type { PendingRequest } from "./PendingRequestsSection";
import { RejectedReservationsSection } from "./RejectedReservationsSection";
import type { RejectedReservation } from "./RejectedReservationsSection";

// "Agenda" — the OWNER/ADMIN default Reservaciones view: one day, every
// court, every 30-minute block always visible (never filtered down to just
// what's free). Reuses the exact same Fecha → Cancha → Mañana/Tarde/Noche
// component built for the player (CourtAvailabilityCard, @/components/
// courts/CourtAvailabilityTimeline) instead of a second grid
// implementation. Unlike the player, occupied ticks here ARE interactive
// (onSelectOccupied) — clicking one opens the "Ticket Preview" side panel
// (ReservationTicketPanel) instead of a centered modal, reusing the exact
// same edit/approve/reject/cancel actions the Semana view already has.

interface AdminAvailabilityViewProps {
  weekDays: DayRangeDay[];
  dayRangeBlocks: DayRangeBlock[];
  todayHref: string;
  todayStr: string;
  courts: CalendarCourt[];
  reservations: CalendarReservation[];
  pendingRequests: PendingRequest[];
  members: Array<{ profile_id: string; full_name: string | null; avatar_url: string | null }>;
  clubId: string;
  clubSlug: string;
  allowedDurations: number[];
  availability: Record<string, Record<string, string[]>>;
  openingMinsByDate: Record<string, number>;
  closingMinsByDate: Record<string, number>;
  closedDates: string[];
  minDuration: number;
  rejectedReservations: RejectedReservation[];
}

// Hover tooltip only lists this many names before falling back to "+N
// más" — keeps a reservation with many players from producing an
// excessively tall tooltip.
const TOOLTIP_MAX_NAMES = 4;

// Fallback headline for a reservation with no linked players — its own
// title, then a Spanish label for its type, then a generic last resort.
// Never invents a name; every value comes from a real field already on the
// reservation. Used by the tooltip; the slot's own label (below) uses the
// same title/"Club" tier, minus the "type" step (no room for a type name
// in a 46px tick).
function fallbackReservationHeadline(title: string | null, type: string): string {
  if (title) return title;
  return TYPE_LABELS[type] ?? "Reserva del club";
}

// Hover/focus tooltip body for a confirmed occupied tick — every
// participant's full name (never truncated behind "+N" here, only the
// tick itself summarizes that way). A "block" reservation never reaches
// here (occupiedTooltipFor returns null for it before calling this).
// `players` is the caller's already-resolved effective list (real
// reservation_players rows, or the approved request's own requester when
// there are none) — genuinely empty only for a club-created reservation
// with no participant of any kind, never "Jugador desconocido" or a dash.
function ConfirmedTooltipContent({ reservation, players }: { reservation: CalendarReservation; players: string[] }) {
  const end = addMinutes(reservation.start_time.slice(0, 5), reservation.duration_minutes);
  if (players.length === 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="truncate">{fallbackReservationHeadline(reservation.title, reservation.type)}</p>
        <p className="text-brand-muted">Sin jugadores asignados</p>
        <p className="text-brand-muted mt-1">
          {reservation.start_time.slice(0, 5)}–{end} · Confirmada
        </p>
      </div>
    );
  }
  const shown = players.slice(0, TOOLTIP_MAX_NAMES);
  const extra = players.length - shown.length;
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((name, i) => (
        <p key={i} className="truncate">{name}</p>
      ))}
      {extra > 0 && <p className="text-brand-muted">+{extra} más</p>}
      <p className="text-brand-muted mt-1">
        {reservation.start_time.slice(0, 5)}–{end} · Confirmada
      </p>
    </div>
  );
}

// A pending request is always self-requested by the player themselves, so
// the "no player" branch here is only a defensive fallback, never expected
// in practice — kept consistent with the confirmed tooltip's wording
// rather than silently rendering nothing.
function PendingTooltipContent({ request }: { request: PendingRequest }) {
  const end = addMinutes(request.start_time.slice(0, 5), request.duration_minutes);
  return (
    <div className="flex flex-col gap-0.5">
      {request.playerName ? (
        <p className="truncate">{request.playerName}</p>
      ) : (
        <>
          <p className="truncate">Reserva del club</p>
          <p className="text-brand-muted">Sin jugadores asignados</p>
        </>
      )}
      <p className="text-brand-muted mt-1">
        {request.start_time.slice(0, 5)}–{end} · Pendiente
      </p>
    </div>
  );
}

// Same date+end-time comparison already established for "is this
// reservation still active" elsewhere (@/components/reservations/
// PlayerActivity's isReservationActive) — reused here inverted, never a
// new rule for what counts as past.
function isReservationPast(date: string, startTime: string, durationMinutes: number): boolean {
  const endTime = addMinutes(startTime.slice(0, 5), durationMinutes);
  const endDate = new Date(`${date}T${endTime}:00`);
  return endDate.getTime() < Date.now();
}

export function AdminAvailabilityView({
  weekDays,
  dayRangeBlocks,
  todayHref,
  todayStr,
  courts,
  reservations,
  pendingRequests,
  members,
  clubId,
  clubSlug,
  allowedDurations,
  availability,
  openingMinsByDate,
  closingMinsByDate,
  closedDates,
  minDuration,
  rejectedReservations,
}: AdminAvailabilityViewProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(
    weekDays.some((d) => d.date === todayStr) ? todayStr : weekDays[0]?.date ?? ""
  );
  const [panelState, setPanelState] = useState<TicketPanelState | null>(null);

  const closedSet = new Set(closedDates);
  const isClosed = closedSet.has(selectedDate);
  const dayGrid = buildDayGrid(openingMinsByDate[selectedDate], closingMinsByDate[selectedDate], minDuration);
  const daySlots = availability[selectedDate] ?? {};

  // Real reservation (confirmed) or pending request covering a given
  // court/tick — found from the same data the page already fetched for the
  // Semana view / "Solicitudes pendientes" section, never a new query.
  function findConfirmed(courtId: string, startTime: string): CalendarReservation | undefined {
    const tickMins = timeToMins(startTime);
    return reservations.find((r) => {
      if (r.court_id !== courtId || r.date !== selectedDate) return false;
      const s = timeToMins(r.start_time);
      return tickMins >= s && tickMins < s + r.duration_minutes;
    });
  }

  function findPending(courtId: string, startTime: string): PendingRequest | undefined {
    const tickMins = timeToMins(startTime);
    return pendingRequests.find((p) => {
      if (p.court_id !== courtId || p.date !== selectedDate) return false;
      const s = timeToMins(p.start_time);
      return tickMins >= s && tickMins < s + p.duration_minutes;
    });
  }

  // Effective participants for display, in priority order:
  //   1. Real reservation_players rows, if any.
  //   2. Otherwise, when this reservation has no explicit participant rows
  //      AND its creator is a PLAYER (never OWNER/ADMIN) — the real
  //      relationship an approved request leaves behind (approving a
  //      request only ever flips its status, it never touches
  //      reservation_players) — that creator IS the requesting player.
  //   3. Otherwise: genuinely no participants (a club-created reservation
  //      nobody linked players to).
  // "Is the creator a PLAYER" is answered by `members` — already loaded,
  // already scoped to this club's active PLAYERs, no new query — an
  // OWNER/ADMIN id simply never matches. Never combines both sources (so
  // no id can ever appear twice), and never treats created_by as a
  // participant for anything other than this one approved-request case.
  function effectivePlayersFor(reservation: CalendarReservation): string[] {
    if (reservation.players.length > 0) return reservation.players;
    if (reservation.type === "block") return [];
    const requester = members.find((m) => m.profile_id === reservation.created_by);
    return requester?.full_name ? [requester.full_name] : [];
  }

  function handleSelectAvailable(courtId: string, startTime: string) {
    setPanelState({ mode: "create", initialDate: selectedDate, initialCourtId: courtId, initialStartTime: startTime });
  }

  // Confirmed → Ticket Preview in view mode (same edit/cancel actions the
  // Semana view already has). Pending (no confirmed reservation on that
  // tick) → Ticket Preview in pending mode (same approve/reject actions
  // "Solicitudes pendientes" already has) — never a new detail screen.
  function handleSelectOccupied(courtId: string, startTime: string) {
    const confirmed = findConfirmed(courtId, startTime);
    if (confirmed) {
      setPanelState({ mode: "view", reservation: confirmed });
      return;
    }
    const pending = findPending(courtId, startTime);
    if (pending) {
      setPanelState({ mode: "pending", pending });
    }
  }

  // Ticket label shown inside an occupied tick — the first effective
  // participant's real visible name for a confirmed reservation, the
  // requester's name for a pending one, so Agenda reads "who" directly
  // instead of a 2-letter abbreviation. The tick's own CSS truncation
  // (TimelineTick) clips a long name with an ellipsis — this never
  // pre-cuts the string itself, and the full name still reaches the
  // tooltip/aria-label/panel unchanged. No players: shows the reservation's
  // own title or "Club" (never the type — no room for that in a 46px
  // tick), same two of the tooltip headline's three tiers.  "block"
  // reservations are untouched — they keep their existing time-only look,
  // this fallback only applies to a real confirmed/pending reservation
  // with no linked players.
  function occupiedLabelFor(courtId: string) {
    return (startTime: string): string | null => {
      const confirmed = findConfirmed(courtId, startTime);
      if (confirmed) {
        const players = effectivePlayersFor(confirmed);
        if (players.length > 0) return players[0];
        if (confirmed.type === "block") return null;
        return confirmed.title ? confirmed.title : "Club";
      }
      const pending = findPending(courtId, startTime);
      if (pending) return pending.playerName ?? "Club";
      return null;
    };
  }

  // Trailing "+N" for a reservation with more than one effective
  // participant — rendered outside the truncating span (occupiedLabel
  // above) so it's never the part an ellipsis eats into. A pending
  // request never has more than its one requester, so this is always null
  // there.
  function occupiedLabelSuffixFor(courtId: string) {
    return (startTime: string): string | null => {
      const confirmed = findConfirmed(courtId, startTime);
      if (!confirmed) return null;
      const players = effectivePlayersFor(confirmed);
      return players.length > 1 ? `+${players.length - 1}` : null;
    };
  }

  // Visual-only amber tint on top of the real "occupied" state — same
  // ContextRange/tone mechanism the player screen uses for its own pending
  // requests, just built here from every pending request on this
  // court/date rather than one player's own.
  function pendingRangesFor(courtId: string): ContextRange[] {
    return pendingRequests
      .filter((p) => p.court_id === courtId && p.date === selectedDate)
      .map((p) => ({ startTime: p.start_time.slice(0, 5), duration: p.duration_minutes, tone: "pending" as const }));
  }

  // Same green "approved" tone the player screen already uses for its own
  // confirmed reservation — reused here for every real confirmed "Partido"
  // reservation on this court/date, so Agenda's occupied ticks read as
  // unmistakably "booked" instead of the faint generic striped look. "Clase"
  // paints light-blue ("class" tone) and "Bloqueo" paints lilac ("block"
  // tone) instead — same mechanism, different tint per reservation type, so
  // every type is identifiable at a glance without touching size, layout or
  // any other Agenda behavior.
  function confirmedRangesFor(courtId: string): ContextRange[] {
    return reservations
      .filter((r) => r.court_id === courtId && r.date === selectedDate)
      .map((r) => ({
        startTime: r.start_time.slice(0, 5),
        duration: r.duration_minutes,
        tone: r.type === "class" ? ("class" as const) : r.type === "block" ? ("block" as const) : ("approved" as const),
      }));
  }

  // Slightly dims a confirmed (non-block) reservation once it's over —
  // still unmistakably "was booked", never mistaken for available/blocked.
  function occupiedPastFor(courtId: string) {
    return (startTime: string): boolean => {
      const confirmed = findConfirmed(courtId, startTime);
      if (!confirmed || confirmed.type === "block") return false;
      return isReservationPast(confirmed.date, confirmed.start_time, confirmed.duration_minutes);
    };
  }

  // Full aria-label for an occupied tick — screen readers get the same
  // status/court/time/participant info sighted admins see from the tick's
  // color + initials, never relying on color alone.
  function occupiedAriaLabelFor(courtId: string, courtName: string) {
    return (startTime: string): string | null => {
      const confirmed = findConfirmed(courtId, startTime);
      if (confirmed) {
        const end = addMinutes(confirmed.start_time.slice(0, 5), confirmed.duration_minutes);
        const timeRange = `${courtName}, de ${confirmed.start_time.slice(0, 5)} a ${end}`;
        if (confirmed.type === "block") {
          return `Bloqueada, ${timeRange}.`;
        }
        // No linked players — never relies on the visible "Club" text alone
        // (point 9 of the spec): screen readers get the same explicit
        // "sin jugadores asignados" wording sighted admins see.
        const players = effectivePlayersFor(confirmed);
        if (players.length === 0) {
          return `Reserva del club sin jugadores asignados, ${timeRange}.`;
        }
        const who = players.length <= 2 ? players.join(" y ") : `${players[0]} y ${players.length - 1} más`;
        return `Reserva confirmada, ${timeRange}, ${who}`;
      }
      const pending = findPending(courtId, startTime);
      if (pending) {
        const end = addMinutes(pending.start_time.slice(0, 5), pending.duration_minutes);
        const timeRange = `${courtName}, de ${pending.start_time.slice(0, 5)} a ${end}`;
        if (!pending.playerName) {
          return `Solicitud pendiente sin jugadores asignados, ${timeRange}.`;
        }
        return `Solicitud pendiente, ${timeRange}, ${pending.playerName}`;
      }
      return null;
    };
  }

  // Desktop hover/focus tooltip content for an occupied tick — the same
  // confirmed/pending data already looked up above, just formatted for
  // display instead of a single aria-label line. Same component for every
  // type (Partido/Clase/Bloqueo) — never a second tooltip implementation;
  // a block reservation always has no players (effectivePlayersFor returns
  // [] for it), so it renders ConfirmedTooltipContent's existing "Sin
  // jugadores asignados" branch. Null only for an occupied tick with no
  // real reservation behind it (CourtAvailabilityCard then renders no
  // tooltip at all for that tick).
  function occupiedTooltipFor(courtId: string) {
    // Render-prop, not a component definition — same shape as
    // occupiedLabelFor/occupiedAriaLabelFor above, just returning JSX
    // instead of a string; CourtAvailabilityCard calls this per tick, it's
    // never rendered as <Foo /> itself, so no displayName applies.
    // eslint-disable-next-line react/display-name
    return (startTime: string) => {
      const confirmed = findConfirmed(courtId, startTime);
      if (confirmed) {
        return <ConfirmedTooltipContent reservation={confirmed} players={effectivePlayersFor(confirmed)} />;
      }
      const pending = findPending(courtId, startTime);
      if (pending) return <PendingTooltipContent request={pending} />;
      return null;
    };
  }

  // Closing the panel never touches selectedDate/scroll — it's just local
  // state going back to null, nothing else in this component changes.
  function handlePanelClose() {
    setPanelState(null);
  }

  function handlePanelChanged() {
    router.refresh();
  }

  const formCourts = courts.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      {/* Day range navigation — exact same shared component/breakpoints the
          player Reservations page uses (@/components/courts/DayRangeNav):
          7 days on mobile, 10/14 on wider desktop, aprovechando el ancho
          disponible. Agenda still only ever renders one selected day below. */}
      {dayRangeBlocks.map((block) => (
        <DayRangeNav
          key={block.count}
          className={`${block.className} mb-5`}
          variant={block.variant}
          days={weekDays.slice(0, block.count)}
          label={block.label}
          prevHref={block.prevHref}
          nextHref={block.nextHref}
          todayHref={todayHref}
          selectedDate={selectedDate}
          todayStr={todayStr}
          closedDates={closedDates}
          courts={courts}
          availability={availability}
          openingMinsByDate={openingMinsByDate}
          closingMinsByDate={closingMinsByDate}
          onSelectDate={setSelectedDate}
        />
      ))}

      <div className="mb-5">
        <AvailabilityLegend showConfirmedState occupiedLabelText="Bloqueada" />
      </div>

      {isClosed ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
            <CalendarOff className="w-5 h-5 text-brand-muted" />
          </div>
          <p className="text-brand-muted text-sm">Club cerrado este día</p>
        </div>
      ) : courts.length === 0 ? (
        <p className="text-sm text-brand-muted">El club aún no tiene canchas configuradas.</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {courts.map((court) => (
            <CourtAvailabilityCard
              key={court.id}
              court={{ id: court.id, name: court.name, surface: null, is_indoor: null }}
              grid={dayGrid}
              slots={daySlots[court.id] ?? []}
              generalContextRanges={[...confirmedRangesFor(court.id), ...pendingRangesFor(court.id)]}
              occupiedLabel={occupiedLabelFor(court.id)}
              occupiedLabelSuffix={occupiedLabelSuffixFor(court.id)}
              occupiedAriaLabel={occupiedAriaLabelFor(court.id, court.name)}
              occupiedPast={occupiedPastFor(court.id)}
              occupiedTooltip={occupiedTooltipFor(court.id)}
              groupByDayPart
              interactive
              onSelectSlot={(startTime) => handleSelectAvailable(court.id, startTime)}
              onSelectOccupied={(startTime) => handleSelectOccupied(court.id, startTime)}
            />
          ))}
        </div>
      )}

      {/* "Reservas rechazadas" — lives here (below every court card), never
          above the Agenda/Semana switcher, so it never competes with the
          date nav/calendar/court grid for top-of-screen space. Rendered only
          inside AdminAvailabilityView (not WeekCalendar) so it appears
          exactly once and only for Agenda — ReservationsViewSwitcher keeps
          both views mounted and toggles visibility via CSS, so this section
          is simply hidden (not unmounted) while Semana is active, same
          mechanism that already preserves its own expanded/collapsed state
          across tab switches. */}
      {rejectedReservations.length > 0 && (
        <div className="mt-8">
          <RejectedReservationsSection reservations={rejectedReservations} clubSlug={clubSlug} />
        </div>
      )}

      {/* Ticket Preview panel — reuses the exact same create/edit/approve/
          reject/cancel actions the rest of the module already has. */}
      <ReservationTicketPanel
        panelState={panelState}
        clubId={clubId}
        clubSlug={clubSlug}
        courts={formCourts}
        members={members}
        allowedDurations={allowedDurations}
        onClose={handlePanelClose}
        onChanged={handlePanelChanged}
      />
    </div>
  );
}
