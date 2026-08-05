"use client";

import { useState, useEffect, useActionState, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, X, Check, CalendarOff } from "lucide-react";
import { Switch } from "@/components/ui";
import { requestReservation, updateMyReservation, getReservationPriceQuote } from "./actions";
import type { RequestFormState } from "./actions";
import type { ResolveReservationPriceResult } from "@/lib/reservationPricing";
import type { MyReservation } from "@/lib/playerReservations";
import { durationOptions, durationLabel } from "@/lib/durations";
import { AvailabilityLegend, CourtAvailabilityCard } from "@/components/courts/CourtAvailabilityTimeline";
import type { ContextRange } from "@/components/courts/CourtAvailabilityTimeline";
import { DayRangeNav } from "@/components/courts/DayRangeNav";
import type { DayRangeDay, DayRangeBlock } from "@/components/courts/DayRangeNav";
import { timeToMins, addMinutes, buildDayGrid } from "@/lib/courtAvailability";
import { buildReservationSlug } from "@/lib/reservationSlug";
import {
  ActivityList,
  sortBookingsByProximity,
  filterVisibleRequests,
  useDismissedReservationIds,
  usePlayerReservationsRealtime,
} from "@/components/reservations/PlayerActivity";

// Shared by the price summary in the request modal and the frozen price
// shown on already-created requests — one formatting rule, not two.
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// ─── Types ────────────────────────────────────────────────────────────────────
// DayRangeDay/DayRangeBlock now live in @/components/courts/DayRangeNav,
// shared with the OWNER/ADMIN Agenda view — no second implementation of the
// day-range navigation.

type Court = { id: string; name: string; surface: string | null; is_indoor: boolean | null };

type BlockedWindow = [number, number];

// Carried over from clicking an activity-panel card (see activityHref below)
// — already fully re-validated server-side (page.tsx: active court, allowed
// duration), each field independently. Non-null only once a card was
// actually clicked; courtId/duration are individually null when that
// specific piece of the underlying reservation is no longer valid (inactive
// court, disallowed duration) — the other still applies rather than the
// whole prefill being dropped. Deliberately has no hour: selecting a card
// must never preselect a time, only switch the calendar's context. The date
// itself is resolved server-side directly into defaultSelectedDate,
// independent of this object.
export type CalendarPrefill = {
  courtId: string | null;
  duration: number | null;
};

interface PlayerAvailabilityCalendarProps {
  weekDays: DayRangeDay[];
  courts: Court[];
  availability: Record<string, Record<string, string[]>>;
  closedDates: string[];
  todayStr: string;
  dayRangeBlocks: DayRangeBlock[];
  todayHref: string;
  clubId: string;
  clubSlug: string;
  clubName?: string;
  // Scopes the SidePanels expand/collapse localStorage preference to this
  // player, alongside clubId — never sent anywhere, purely a local key.
  playerId: string;
  defaultSelectedDate: string;
  allowedDurations: number[];
  openingMinsByDate: Record<string, number>;
  closingMinsByDate: Record<string, number>;
  blockedByDate: Record<string, Record<string, BlockedWindow[]>>;
  // "Mis solicitudes" — only the request lifecycle the player themselves
  // started (requestReservation): pending and rejected only, page.tsx
  // already excludes confirmed/cancelled here.
  myReservations: MyReservation[];
  // "Mis reservas" — every CONFIRMED reservation the player participates
  // in, however it was created (self-requested-then-approved, or OWNER/
  // ADMIN added them directly via reservation_players). See page.tsx.
  myBookings: MyReservation[];
  prefill: CalendarPrefill | null;
  // The activity-panel card currently selected — set from the reservationId
  // query param (page.tsx), already validated to belong to this player and
  // this club (as requester or as participant). Independent of
  // myReservations/myBookings' date windows, so it still resolves even if
  // the date has since elapsed. Drives both the calendar context switch and
  // the contextual slot highlight (green/amber/red).
  focusReservation: MyReservation | null;
  // clubs.archived_at IS NOT NULL — real protection is server-side
  // (create_reservation_player), this only hides the affordance.
  archived?: boolean;
  // Non-null only when "Editar reserva" was clicked (PlayerActivity.tsx)
  // AND page.tsx re-validated the reservation still qualifies (creator,
  // pending/confirmed, 2+ hours out) — switches the next slot click into
  // edit mode instead of create mode. Purely a UI-mode flag: the real
  // authorization/re-validation happens inside update_reservation
  // regardless of this value.
  editingReservation: MyReservation | null;
}

type ModalSlot = {
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  // Reflects whatever duration is currently governing the day view
  // (selectedDuration) at the moment the player picks a slot — so the
  // modal never silently reverts to allowedDurations[0].
  duration?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatModalDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function filterSlotsByDuration(
  baseSlots: string[],
  duration: number,
  closingMins: number | undefined,
  blocked: BlockedWindow[],
): string[] {
  return baseSlots.filter((slot) => {
    const start = timeToMins(slot);
    const end = start + duration;
    if (closingMins !== undefined && end > closingMins) return false;
    return !blocked.some(([rStart, rEnd]) => start < rEnd && end > rStart);
  });
}

// Header for a collapsible panel block — title, live count, and a
// chevron, the whole row acting as the expand/collapse control (never a
// navigation link). aria-expanded/aria-controls carry the state for
// assistive tech; the chevron alone never has to (point 9 of the spec).
function PanelSectionHeader({
  title,
  count,
  expanded,
  onToggle,
  controlsId,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className="flex items-center justify-between w-full py-1.5 -my-1.5 gap-2 text-left rounded-lg transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
    >
      <h2 className="text-sm font-semibold text-white">
        {title} <span className="text-brand-muted font-normal">({count})</span>
      </h2>
      {expanded ? (
        <ChevronUp className="w-4 h-4 text-brand-muted shrink-0" aria-hidden="true" />
      ) : (
        <ChevronDown className="w-4 h-4 text-brand-muted shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}

// Two clearly separated blocks reflecting the real business model: "Mis
// reservas" is every CONFIRMED reservation the player participates in
// regardless of how it was created (myBookings — see page.tsx); "Mis
// solicitudes" is only the request lifecycle the player themselves started
// (myReservations — already pending/rejected only, most-recent-first within
// each status, from page.tsx). Same card style/component for both, just two
// different data sources and headings — no redesign. "Mis solicitudes"
// renders first: it's the block that can still need the player's attention
// (pending/rejected), "Mis reservas" is already-settled confirmed bookings.
function SidePanels({
  myBookings,
  myReservations,
  clubSlug,
  clubName,
  viewerId,
  selectedId,
  dismissedIds,
  onDismiss,
  solicitudesExpanded,
  reservasExpanded,
  onToggleSolicitudes,
  onToggleReservas,
}: {
  myBookings: MyReservation[];
  myReservations: MyReservation[];
  clubSlug: string;
  clubName?: string;
  viewerId: string;
  selectedId: string | null;
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
  solicitudesExpanded: boolean;
  reservasExpanded: boolean;
  onToggleSolicitudes: () => void;
  onToggleReservas: () => void;
}) {
  const visibleBookings = sortBookingsByProximity(myBookings);

  // dismissedIds only ever applies to rejected: pending is still being
  // processed and can never be dismissed, so a stale localStorage entry
  // from before that rule existed must not hide one now. Also exactly the
  // set of "operative" requests the header counter (below) must reflect —
  // pending + visible-rejected, never approved (those live in myBookings)
  // nor a dismissed rejected one. Shared with the player home page
  // (filterVisibleRequests, @/components/reservations/PlayerActivity) so
  // both apply the exact same rule.
  const visibleRequests = filterVisibleRequests(myReservations, dismissedIds);

  return (
    <div id="mis-solicitudes" className="flex flex-col gap-6 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-0.5">
      <div className="flex flex-col gap-3">
        <PanelSectionHeader
          title="Mis solicitudes"
          count={visibleRequests.length}
          expanded={solicitudesExpanded}
          onToggle={onToggleSolicitudes}
          controlsId="panel-solicitudes-list"
        />
        {/* `hidden` (not unmounting) keeps this id valid for the header's
            aria-controls at all times, collapsed or not. */}
        <div id="panel-solicitudes-list" hidden={!solicitudesExpanded}>
          <ActivityList
            reservations={visibleRequests}
            clubSlug={clubSlug}
            clubName={clubName}
            viewerId={viewerId}
            selectedId={selectedId}
            onDismiss={onDismiss}
            emptyMessage="Aún no tienes solicitudes de reserva."
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
        <PanelSectionHeader
          title="Mis reservas"
          count={visibleBookings.length}
          expanded={reservasExpanded}
          onToggle={onToggleReservas}
          controlsId="panel-reservas-list"
        />
        <div id="panel-reservas-list" hidden={!reservasExpanded}>
          <ActivityList
            reservations={visibleBookings}
            clubSlug={clubSlug}
            clubName={clubName}
            viewerId={viewerId}
            selectedId={selectedId}
            onDismiss={onDismiss}
            emptyMessage="No tienes reservas próximas."
          />
        </div>
      </div>
    </div>
  );
}

// ─── Request Modal ────────────────────────────────────────────────────────────

function RequestModal({
  courtId,
  courtName,
  date,
  startTime,
  duration: initialDuration,
  clubId,
  clubSlug,
  allowedDurations,
  editingReservationId,
  onClose,
  onSuccess,
}: ModalSlot & {
  clubId: string;
  clubSlug: string;
  allowedDurations: number[];
  // Set only when this modal was opened to move an existing reservation
  // (see editingReservation on the main component) — binds the form to
  // updateMyReservation instead of requestReservation, everything else
  // about the modal (duration picker, price quote, layout) is reused as-is.
  editingReservationId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const durations = durationOptions(allowedDurations);
  const [duration, setDuration] = useState(initialDuration ?? allowedDurations[0] ?? 60);
  const isEditMode = !!editingReservationId;
  // Reservas Abiertas/Cerradas — solo al crear (updateMyReservation nunca
  // toca is_open, igual que su contraparte OWNER/ADMIN). Sin selector de
  // jugadores en este formulario, así que el tope de 4 nunca aplica aquí.
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    isEditMode
      ? updateMyReservation.bind(null, editingReservationId!, clubSlug)
      : requestReservation.bind(null, clubId),
    {},
  );

  // requestKey identifies the exact (courtId, date, startTime, duration)
  // combination a quote belongs to. priceState only ever gets written from
  // the effect's async .then() callback (never synchronously in the effect
  // body), so the render right after any dependency change already sees
  // priceState.key !== requestKey — the previous quote is treated as stale
  // immediately, with no separate "invalidate" setState call needed.
  const requestKey = `${clubId}|${courtId}|${date}|${startTime}|${duration}`;
  const [priceState, setPriceState] = useState<{ key: string; result: ResolveReservationPriceResult | null }>({
    key: "",
    result: null,
  });
  const priceLoading = priceState.key !== requestKey;
  const priceQuote = priceLoading ? null : priceState.result;

  // Re-quotes on every change to courtId/date/startTime/duration (courtId/
  // date/startTime are stable for this modal's lifetime — the parent
  // remounts it via a fresh `key` whenever any of those change — but
  // duration changes here directly). The `cancelled` flag discards a
  // response that resolves after a newer request was already made — same
  // pattern already used by getAvailableSlots in ReservationForm.tsx.
  // resolveReservationPrice stays the only source of truth: no day-of-week/
  // franja/priority/rate math is repeated here.
  useEffect(() => {
    let cancelled = false;
    getReservationPriceQuote(clubId, courtId, date, startTime, duration).then((result) => {
      if (cancelled) return;
      setPriceState({ key: requestKey, result });
    });
    return () => { cancelled = true; };
  }, [clubId, courtId, date, startTime, duration, requestKey]);

  useEffect(() => {
    if (state?.success) onSuccess();
  }, [state?.success, onSuccess]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const endTime = addMinutes(startTime, duration);
  const dateLabel = formatModalDate(date);

  return (
    <div className="fixed inset-0 z-[500] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full md:w-[420px] bg-brand-surface border border-white/10 rounded-t-2xl md:rounded-2xl flex flex-col max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-base font-bold text-white">{isEditMode ? "Editar reserva" : "Solicitar reserva"}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-brand-muted hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details */}
        <div className="px-5 pt-4 pb-2 flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-brand-muted">Cancha</span>
            <span className="text-white font-medium">{courtName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-brand-muted">Fecha</span>
            <span className="text-white font-medium capitalize">{dateLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-brand-muted">Hora</span>
            <span className="text-white font-medium">{startTime} – {endTime}</span>
          </div>
        </div>

        {/* Form */}
        <form action={formAction} className="px-5 pb-5 pt-3 flex flex-col gap-4">
          <input type="hidden" name="court_id" value={courtId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="start_time" value={startTime} />
          <input type="hidden" name="duration_minutes" value={String(duration)} />

          {/* Duration selector */}
          <div>
            <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">
              Duración
            </p>
            <div className={`grid gap-2 ${durations.length <= 2 ? "grid-cols-2" : durations.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
              {durations.map(({ minutes, label }) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDuration(minutes)}
                  className={`py-2 px-1 rounded-xl text-xs font-medium border transition-colors ${
                    duration === minutes
                      ? "border-brand-primary text-brand-primary bg-brand-primary/10"
                      : "border-white/10 text-brand-muted hover:border-white/30 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* End time preview */}
          <p className="text-xs text-brand-muted text-center">
            Reserva de{" "}
            <span className="text-white font-medium">{startTime} a {endTime}</span>
          </p>

          {/* Price summary — always the server's resolveReservationPrice
              result, never computed here. Re-requested on every duration
              change (see effect above). */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-1.5">
            {priceLoading ? (
              <div className="flex items-center gap-2 text-xs text-brand-muted py-0.5">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
                Calculando precio…
              </div>
            ) : priceQuote?.matched ? (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-brand-muted">Tarifa aplicada</span>
                  <span className="text-white font-medium">{priceQuote.ruleName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-brand-muted">Duración</span>
                  <span className="text-white font-medium">{durationLabel(priceQuote.durationMinutes)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1.5 mt-0.5 border-t border-white/10">
                  <span className="text-brand-muted font-medium">Valor de la reserva</span>
                  <span className="font-bold" style={{ color: "var(--club-primary, #00ffff)" }}>
                    {formatCurrency(priceQuote.finalPrice, priceQuote.currency)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-brand-muted text-center">Precio no disponible para este horario.</p>
            )}
          </div>

          {/* Aceptar solicitudes de jugadores (is_open internamente) — solo
              al crear. El PLAYER nunca agrega jugadores acá (siempre crea
              solo para sí mismo), así que "Reserva abierta/cerrada" no es
              un modelo mental claro — el switch describe la consecuencia
              real (otros podrán solicitar unirse), nunca ese término. */}
          {!isEditMode && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5">
              <div className="flex flex-col pr-2">
                <span className="text-sm text-white font-medium">Aceptar solicitudes de jugadores</span>
                <span className="text-xs text-brand-muted">
                  {isOpen
                    ? "Otros jugadores del club podrán solicitar unirse una vez la reserva sea aprobada. Tú decidirás si aceptarlos."
                    : "Solo tú podrás participar inicialmente en esta reserva."}
                </span>
              </div>
              <Switch checked={isOpen} onChange={setIsOpen} label="Aceptar solicitudes de jugadores" />
              {isOpen && <input type="hidden" name="is_open" value="true" />}
            </div>
          )}

          {state?.error && (
            <p className="text-sm text-red-400 text-center bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || priceLoading || !priceQuote?.matched}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--club-primary, #00ffff)", color: "#001A24" }}
          >
            {pending ? "Guardando…" : isEditMode ? "Guardar cambios" : "Enviar solicitud"}
          </button>

          <p className="text-xs text-brand-muted text-center leading-relaxed">
            {isEditMode
              ? "Si tu reserva ya estaba confirmada, un cambio de horario puede requerir nueva aprobación del club."
              : "Tu solicitud quedará pendiente de aprobación por el administrador."}
          </p>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
// AvailabilityLegend and CourtAvailabilityCard now live in
// @/components/courts/CourtAvailabilityTimeline, shared with the admin
// reservation review screen — no second implementation of the timeline.
// DayRangeNav now lives in @/components/courts/DayRangeNav, shared with the
// OWNER/ADMIN Agenda view — no second implementation of the day-range
// navigation either.

// Expand/collapse preference for the two SidePanels blocks — same
// useSyncExternalStore-over-localStorage shape as the dismissed-requests
// store (@/components/reservations/PlayerActivity, one mechanism, not two),
// just storing "expanded"/"collapsed" instead of a Set. Scoped per club AND
// per player (falls back to "anon" only if the player id genuinely hasn't
// resolved yet) so one player's collapsed preference never leaks into
// another's view of the same club — the dismissed-requests store only
// scopes by club because that preference is low-stakes; this one is
// explicitly asked to also isolate by player.
type Listener = () => void;
type PanelSection = "solicitudes" | "reservas";
const panelSectionListeners = new Set<Listener>();

function notifyPanelSectionChanged() {
  panelSectionListeners.forEach((listener) => listener());
}

function subscribePanelSection(listener: Listener) {
  panelSectionListeners.add(listener);
  return () => {
    panelSectionListeners.delete(listener);
  };
}

function panelSectionStorageKey(clubId: string, playerId: string | null, section: PanelSection): string {
  return `padelclub:panel-section:${clubId}:${playerId ?? "anon"}:${section}`;
}

function getPanelSectionSnapshot(clubId: string, playerId: string | null, section: PanelSection): string {
  try {
    return window.localStorage.getItem(panelSectionStorageKey(clubId, playerId, section)) ?? "expanded";
  } catch {
    return "expanded";
  }
}

// Both blocks start expanded on a first visit (no persisted preference yet)
// — same value SSR renders, so hydration reconciles cleanly with no
// mismatch, exactly like getDismissedServerSnapshot above.
function getPanelSectionServerSnapshot(): string {
  return "expanded";
}

function setPanelSectionExpanded(clubId: string, playerId: string | null, section: PanelSection, expanded: boolean) {
  try {
    window.localStorage.setItem(panelSectionStorageKey(clubId, playerId, section), expanded ? "expanded" : "collapsed");
    notifyPanelSectionChanged();
  } catch {
    // Storage quota/private-mode failure — purely a visual preference, so
    // there's nothing to persist or notify listeners about.
  }
}

export function PlayerAvailabilityCalendar({
  weekDays,
  courts,
  availability,
  closedDates,
  todayStr,
  dayRangeBlocks,
  todayHref,
  clubId,
  clubSlug,
  clubName,
  playerId,
  defaultSelectedDate,
  allowedDurations,
  openingMinsByDate,
  closingMinsByDate,
  blockedByDate,
  myReservations,
  myBookings,
  prefill,
  focusReservation,
  archived,
  editingReservation,
}: PlayerAvailabilityCalendarProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(defaultSelectedDate);
  const [selectedDuration, setSelectedDuration] = useState(prefill?.duration ?? allowedDurations[0] ?? 60);
  const [modalSlot, setModalSlot] = useState<ModalSlot | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const durations = durationOptions(allowedDurations);

  // Dismissed rejected requests — shared store/hook (also used by the
  // player home page), scoped per club so descartar here is instantly
  // reflected there too.
  const { dismissedIds, dismiss: handleDismiss } = useDismissedReservationIds(clubId);

  // SidePanels expand/collapse — same store shape as dismissedIds above.
  // Both start "expanded" (getPanelSectionServerSnapshot) until hydration
  // reconciles any real persisted preference, so there's no SSR mismatch.
  // Purely a display preference: never touches selection, Realtime, or data.
  const solicitudesExpanded =
    useSyncExternalStore(
      subscribePanelSection,
      () => getPanelSectionSnapshot(clubId, playerId, "solicitudes"),
      getPanelSectionServerSnapshot
    ) !== "collapsed";
  const reservasExpanded =
    useSyncExternalStore(
      subscribePanelSection,
      () => getPanelSectionSnapshot(clubId, playerId, "reservas"),
      getPanelSectionServerSnapshot
    ) !== "collapsed";

  const handleToggleSolicitudes = useCallback(() => {
    setPanelSectionExpanded(clubId, playerId, "solicitudes", !solicitudesExpanded);
  }, [clubId, playerId, solicitudesExpanded]);

  const handleToggleReservas = useCallback(() => {
    setPanelSectionExpanded(clubId, playerId, "reservas", !reservasExpanded);
  }, [clubId, playerId, reservasExpanded]);

  // ─── Realtime sync ──────────────────────────────────────────────────────
  // Shared hook (also used by the player home page) — one channel, four
  // listeners, never a second subscription. router.refresh() re-fetches
  // this page's server data, so the real status/price/etc. always comes
  // back from Supabase, never assumed from the event payload.
  const handleRealtimeChange = useCallback(() => router.refresh(), [router]);
  usePlayerReservationsRealtime(handleRealtimeChange);

  // ─── Prop-driven state resets (React "adjust state during render" —
  // https://react.dev/learn/you-might-not-need-an-effect) ────────────────
  // selectedDate only used defaultSelectedDate as a useState initializer
  // before, so it never moved when the server recomputed it for a new week
  // or a new retry prefill on an already-mounted component — this keeps it
  // in sync regardless of whether navigation happens to remount the tree.
  const [appliedDefaultDate, setAppliedDefaultDate] = useState(defaultSelectedDate);
  if (defaultSelectedDate !== appliedDefaultDate) {
    setAppliedDefaultDate(defaultSelectedDate);
    setSelectedDate(defaultSelectedDate);
  }

  // Clicking an activity card lands on its duration — only when that
  // duration is still allowed (prefill.duration is null otherwise, e.g. the
  // club dropped it; the current/default duration is left untouched
  // instead) — and always clears any hour selection in progress, never
  // preselecting an hour itself nor leaving a stale slot highlighted from
  // before the click. Date is handled separately, directly through
  // defaultSelectedDate above.
  const prefillKey = prefill ? `${prefill.courtId ?? ""}|${prefill.duration ?? ""}` : null;
  const [appliedPrefillKey, setAppliedPrefillKey] = useState<string | null>(null);
  if (prefill && prefillKey !== appliedPrefillKey) {
    setAppliedPrefillKey(prefillKey);
    if (prefill.duration != null) setSelectedDuration(prefill.duration);
    setModalSlot(null);
  }

  // Pure DOM side effect (scrolling), not state — stays in a real effect.
  // Brings the same court into view so clicking an activity card visibly
  // lands the player on availability instead of looking like nothing
  // happened. Skipped when the court itself is no longer valid
  // (prefill.courtId is null) — "abre la disponibilidad normal... sin
  // producir errores".
  useEffect(() => {
    if (!prefill?.courtId) return;
    document.getElementById(`court-${prefill.courtId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [prefill]);

  useEffect(() => {
    if (!successBanner) return;
    const t = setTimeout(() => setSuccessBanner(null), 5000);
    return () => clearTimeout(t);
  }, [successBanner]);

  const handleSuccess = useCallback(() => {
    setModalSlot(null);
    setSuccessBanner(
      editingReservation
        ? "Tu reserva fue actualizada."
        : "Tu solicitud fue enviada. El administrador la confirmará pronto."
    );
    router.refresh(); // Re-fetches server data → updates availability + Mis solicitudes
    if (editingReservation) router.push(`/${clubSlug}/reservations`);
  }, [router, editingReservation, clubSlug]);

  const isClosed = closedDates.includes(selectedDate);
  const openingMins = openingMinsByDate[selectedDate];
  const closingMins = closingMinsByDate[selectedDate];
  const baseAvailability = availability[selectedDate] ?? {};
  const dateBlocked = blockedByDate[selectedDate] ?? {};
  const minDuration = Math.min(...allowedDurations);

  // Real, duration-aware selectable start times per court — identical
  // computation as before, just no longer used to hide fully-booked courts:
  // the timeline itself is expected to show "ocupado" segments, not omit
  // the court entirely.
  const courtsWithSlots = courts.map((c) => ({
    ...c,
    slots: filterSlotsByDuration(
      baseAvailability[c.id] ?? [],
      selectedDuration,
      closingMins,
      dateBlocked[c.id] ?? [],
    ),
  }));

  // Same 30-minute grid the server built for this date (page.tsx's
  // computeAvailability), rebuilt client-side purely to draw ticks — shared
  // by every court card since operating hours are club-wide, not per-court.
  const dayGrid = buildDayGrid(openingMins, closingMins, minDuration);

  function selectedRangeFor(courtId: string) {
    return modalSlot && modalSlot.courtId === courtId
      ? { startTime: modalSlot.startTime, duration: selectedDuration }
      : null;
  }

  // Single shared mapping from the model's real statuses to the timeline's
  // visual tones — used by both the individual-selection highlight and the
  // general (nothing-selected) view below, so the two never drift apart.
  // "cancelled" and anything else stay unhighlighted (not one of the
  // panel's 3 supported states).
  function toneForStatus(status: MyReservation["status"]): ContextRange["tone"] | null {
    if (status === "confirmed") return "approved";
    if (status === "rejected") return "rejected";
    if (status === "pending") return "pending";
    return null;
  }

  // Purely visual — the activity card currently selected via focusReservation
  // (URL-driven, see page.tsx), painted on its own court/date only. Never
  // read by the availability engine: "aprobada" tints an already-occupied
  // slot green, "rechazada" tints whatever the slot's real state already is
  // (usually available again) soft red, and "pending" tints an
  // already-occupied slot amber (the player's own pending request still
  // blocks it the same way "aprobada" does) — every one of the model's
  // three real statuses gets the same contextual highlight, not just two of
  // them.
  function contextRangeFor(courtId: string): ContextRange | null {
    if (!focusReservation) return null;
    if (focusReservation.court_id !== courtId) return null;
    if (focusReservation.date !== selectedDate) return null;
    const tone = toneForStatus(focusReservation.status);
    if (!tone) return null;
    return { startTime: focusReservation.start_time.slice(0, 5), duration: focusReservation.duration_minutes, tone };
  }

  // General view (no individual selection) — every one of the player's own
  // reservations on this court/date, painted simultaneously: myReservations
  // (pending/rejected, "Mis solicitudes") for amber/red, myBookings
  // (confirmed, "Mis reservas") for green — the same two sources the panel
  // below reads from, never a third list built just for the calendar.
  // Suppressed entirely the moment a card is selected (contextRangeFor
  // above takes over instead — dismissedIds never applies there, so an
  // explicit reservationId still shows a dismissed rejected one's red
  // context), so the two views never overlap. A dismissed *rejected* one is
  // skipped here too — the same dismissedIds collection that hides its
  // panel card also hides its general-view red highlight (one mechanism,
  // not two). Pending/approved are never dismissible in the first place, so
  // dismissedIds never affects them.
  function generalContextRangesFor(courtId: string): ContextRange[] {
    if (focusReservation) return [];
    const ranges: ContextRange[] = [];
    for (const r of myReservations) {
      if (r.court_id !== courtId || r.date !== selectedDate) continue;
      if (r.status === "rejected" && dismissedIds.has(r.id)) continue;
      const tone = toneForStatus(r.status);
      if (!tone) continue;
      ranges.push({ startTime: r.start_time.slice(0, 5), duration: r.duration_minutes, tone });
    }
    for (const r of myBookings) {
      if (r.court_id !== courtId || r.date !== selectedDate) continue;
      const tone = toneForStatus(r.status);
      if (!tone) continue;
      ranges.push({ startTime: r.start_time.slice(0, 5), duration: r.duration_minutes, tone });
    }
    return ranges;
  }

  // Which (if any) of the player's own CONFIRMED or PENDING reservations
  // occupies this exact court/date/time — same match rule
  // generalContextRangesFor already uses, reused here so an occupied tick
  // that's the player's own reservation (approved, or still awaiting the
  // club's approval) can open its detail page — the share detail page
  // already supports a pending reservation, this was purely a navigation
  // gap. Rejected/cancelled are excluded on purpose (a rejected tick isn't
  // rendered as "occupied" at all — the slot is free again — and clicking
  // one was never part of this fix; "Mis solicitudes" keeps its existing
  // behavior for those). Never reveals anything about a tick that ISN'T
  // the player's own — onSelectOccupied below simply no-ops when this
  // returns null.
  function myBookingAt(courtId: string, startTime: string): MyReservation | null {
    const booking = myBookings.find((r) => r.court_id === courtId && r.date === selectedDate && r.start_time.slice(0, 5) === startTime);
    if (booking) return booking;
    return (
      myReservations.find(
        (r) => r.status === "pending" && r.court_id === courtId && r.date === selectedDate && r.start_time.slice(0, 5) === startTime
      ) ?? null
    );
  }

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-6">
      {/* Main column — calendar/availability stays first and largest, the
          screen's primary content. */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Success banner */}
        {successBanner && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-sm">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successBanner}</span>
          </div>
        )}

        {/* Edit mode banner — reuses the same court-card availability grid
            below to pick the new slot; no separate calendar/form. */}
        {editingReservation && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 text-sm">
            <span>Editando reserva — selecciona un nuevo horario en el calendario.</span>
            <a
              href={`/${clubSlug}/reservations`}
              className="text-xs font-medium text-white/70 hover:text-white transition-colors shrink-0"
            >
              Cancelar edición
            </a>
          </div>
        )}

        {/* Day range navigation — one DayRangeNav per breakpoint (7/10/14
            days); className on each block (page.tsx) is the only thing
            deciding which is visible, so this is pure CSS with no width
            detection in JS. */}
        {dayRangeBlocks.map((block) => (
          <DayRangeNav
            key={block.count}
            className={block.className}
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

        {/* Duration selector — compact, only shown when there are multiple options and day is open */}
      {!isClosed && durations.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-brand-muted uppercase tracking-wider">Duración</span>
          <div className="flex gap-1.5 flex-wrap">
            {durations.map(({ minutes, label }) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setSelectedDuration(minutes)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  selectedDuration === minutes
                    ? "border-brand-primary text-brand-primary bg-brand-primary/10"
                    : "border-white/10 text-brand-muted hover:border-white/20 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

        {/* Court cards + timeline */}
        <div className="flex flex-col gap-3">
          {isClosed ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                <CalendarOff className="w-5 h-5 text-brand-muted" />
              </div>
              <p className="text-brand-muted text-sm">Club cerrado este día</p>
            </div>
          ) : (
            <>
              <AvailabilityLegend showPlayerRequestStates />
              {/* auto-fit instead of a fixed lg:grid-cols-2: a single court
                  stretches to the column's full width (a fixed 2-column
                  grid left it stuck at ~50%, with the empty second cell
                  reading as a gap before the side panel) — 2+ courts still
                  wrap into as many 300px+ columns as actually fit. */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
                {courtsWithSlots.map((court) => (
                  // id lets an activity-card click scroll straight to the
                  // same court (see the prefill effect above) without
                  // touching the shared CourtAvailabilityTimeline component
                  // itself.
                  <div key={court.id} id={`court-${court.id}`}>
                    <CourtAvailabilityCard
                      court={court}
                      grid={dayGrid}
                      slots={court.slots}
                      selectedRange={selectedRangeFor(court.id)}
                      contextRange={contextRangeFor(court.id)}
                      generalContextRanges={generalContextRangesFor(court.id)}
                      groupByDayPart
                      onSelectSlot={(startTime) => {
                        if (archived) return; // server (create_reservation_player/update_reservation) is the real guard — this only stops the affordance
                        setModalSlot({ courtId: court.id, courtName: court.name, date: selectedDate, startTime, duration: selectedDuration });
                      }}
                      onSelectOccupied={(startTime) => {
                        const mine = myBookingAt(court.id, startTime);
                        if (!mine) return;
                        // Slug corto legible (@/lib/reservationSlug) — sin
                        // nombre del creador acá (no está cargado en este
                        // componente), así que buildReservationSlug incrusta
                        // el uuid real (mine.id) en vez de un placeholder de
                        // nombre inventado — resolve_reservation_slug exige
                        // una coincidencia EXACTA de nombre y nunca resuelve
                        // un placeholder, así que sin el uuid este enlace
                        // quedaba permanentemente en 404 (bug real,
                        // confirmado contra la base). La página se
                        // autocorrige al slug legible en cuanto carga el
                        // nombre real del creador.
                        const slug = buildReservationSlug({ creatorName: null, date: mine.date, startTime: mine.start_time, id: mine.id });
                        router.push(`/${clubSlug}/reservations/${slug}`);
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Side panel — desktop: real side column; mobile: stacked below the
          calendar (still second, never competing with it for space). Same
          width/position as before the "Mis reservas" split. */}
      <aside className="w-full lg:w-[300px] xl:w-[340px] shrink-0 lg:sticky lg:top-6">
        <SidePanels
          myBookings={myBookings}
          myReservations={myReservations}
          clubSlug={clubSlug}
          clubName={clubName}
          viewerId={playerId}
          selectedId={focusReservation?.id ?? null}
          dismissedIds={dismissedIds}
          onDismiss={handleDismiss}
          solicitudesExpanded={solicitudesExpanded}
          reservasExpanded={reservasExpanded}
          onToggleSolicitudes={handleToggleSolicitudes}
          onToggleReservas={handleToggleReservas}
        />
      </aside>

      {/* Request modal — same component/form for both creating a new
          reservation and editing an existing one (editingReservation),
          never two independent implementations. */}
      {modalSlot && (
        <RequestModal
          key={`${modalSlot.courtId}-${modalSlot.date}-${modalSlot.startTime}`}
          {...modalSlot}
          clubId={clubId}
          clubSlug={clubSlug}
          allowedDurations={allowedDurations}
          editingReservationId={editingReservation?.id}
          onClose={() => setModalSlot(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
