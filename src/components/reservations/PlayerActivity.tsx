"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { X, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addMinutes } from "@/lib/courtAvailability";
import { durationLabel } from "@/lib/durations";
import type { MyReservation } from "@/lib/playerReservations";

// Every surface that shows a player's own reservations/requests (the
// Reservations page's side panel, the player home page) shares this exact
// set of cards, rules and hooks — one implementation, never a second one
// that could quietly drift from these.

// ─── Navigation ───────────────────────────────────────────────────────────────
// Every activity card resolves through the SAME Reservations page — never a
// second "detail" screen. page.tsx re-validates court/duration/date
// server-side before trusting reservationId as a prefill.
export function activityHref(clubSlug: string, reservationId: string): string {
  return `/${clubSlug}/reservations?reservationId=${reservationId}`;
}

// "mié 12 ago" — compact form for activity cards, shorter than the
// calendar's day-tab/modal long weekday+month form.
function formatCompactDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Visibility / ordering rules ───────────────────────────────────────────────

// Whether a reservation still has operative value for the panel — pending
// (still being processed) and rejected (recent history, dismissible) always
// qualify; an approved/confirmed one only qualifies while it hasn't ended
// yet. Compares full date+end-time, never just the date, so a reservation
// ending at 19:30 stays visible until 19:30 has actually passed. Anything
// else (cancelled, or a future status this panel doesn't model) is excluded
// — the reservation still exists in Supabase and in the full history, it
// just has no place in this operational panel. Date.now() is called from
// inside this plain helper (not a component body) so a fresh render always
// re-evaluates it without introducing a timer/polling loop.
export function isReservationActive(r: MyReservation): boolean {
  if (r.status === "pending" || r.status === "rejected") return true;
  if (r.status !== "confirmed") return false;
  const endTime = addMinutes(r.start_time.slice(0, 5), r.duration_minutes);
  const endDate = new Date(`${r.date}T${endTime}:00`);
  return endDate.getTime() > Date.now();
}

// Whether a (still-active, per isReservationActive) confirmed reservation
// has already started — used only to sort "Mis reservas" ("en curso" cards
// first), never to decide visibility.
function isReservationInProgress(r: MyReservation): boolean {
  const startDate = new Date(`${r.date}T${r.start_time.slice(0, 5)}:00`);
  return startDate.getTime() <= Date.now();
}

// "Mis reservas" ordering: reservations already in progress first, then
// upcoming ones soonest-first — a finished one never appears at all
// (isReservationActive). Reused verbatim for "Mis próximas reservas" on the
// player home page — same rule, same order, not a second implementation.
export function sortBookingsByProximity(bookings: MyReservation[]): MyReservation[] {
  return bookings
    .filter(isReservationActive)
    .slice()
    .sort((a, b) => {
      const aRank = isReservationInProgress(a) ? 0 : 1;
      const bRank = isReservationInProgress(b) ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      const aStart = new Date(`${a.date}T${a.start_time.slice(0, 5)}:00`).getTime();
      const bStart = new Date(`${b.date}T${b.start_time.slice(0, 5)}:00`).getTime();
      return aStart - bStart;
    });
}

// "Mis solicitudes" visibility: pending is always shown (still being
// processed); rejected only while not locally dismissed. approved never
// belongs here — it's already surfaced as a booking
// (sortBookingsByProximity above) the moment it's confirmed.
export function filterVisibleRequests(myReservations: MyReservation[], dismissedIds: Set<string>): MyReservation[] {
  return myReservations.filter((r) => r.status !== "rejected" || !dismissedIds.has(r.id));
}

// ─── Dismissed-rejected-requests store ─────────────────────────────────────────
// localStorage-backed, scoped per club only — so dismissing a rejected card
// on one page (Reservations side panel or the player home page) is
// instantly reflected on the other: one key, one mechanism, never two
// independent "dismissed" collections.

type Listener = () => void;
const dismissedListeners = new Set<Listener>();

function notifyDismissedChanged() {
  dismissedListeners.forEach((listener) => listener());
}

function subscribeDismissed(listener: Listener) {
  dismissedListeners.add(listener);
  return () => {
    dismissedListeners.delete(listener);
  };
}

function dismissedStorageKey(clubId: string): string {
  return `padelclub:dismissed-reservations:${clubId}`;
}

function getDismissedSnapshot(clubId: string): string {
  try {
    return window.localStorage.getItem(dismissedStorageKey(clubId)) ?? "[]";
  } catch {
    return "[]";
  }
}

function getDismissedServerSnapshot(): string {
  return "[]";
}

function parseDismissedIds(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

// Tiny external store over localStorage — the standard useSyncExternalStore
// shape (subscribe/getSnapshot/getServerSnapshot) instead of an effect that
// calls setState on mount: React itself reconciles the server-rendered
// snapshot ("[]", nothing dismissed) with the real client value right after
// hydration, with no manual setState-in-effect and no mismatch warning.
export function useDismissedReservationIds(clubId: string): {
  dismissedIds: Set<string>;
  dismiss: (id: string) => void;
} {
  const raw = useSyncExternalStore(
    subscribeDismissed,
    () => getDismissedSnapshot(clubId),
    getDismissedServerSnapshot
  );
  const dismissedIds = useMemo(() => parseDismissedIds(raw), [raw]);

  const dismiss = useCallback(
    (id: string) => {
      const ids = parseDismissedIds(getDismissedSnapshot(clubId));
      if (ids.has(id)) return;
      ids.add(id);
      try {
        window.localStorage.setItem(dismissedStorageKey(clubId), JSON.stringify([...ids]));
        notifyDismissedChanged();
      } catch {
        // Storage quota/private-mode failure — nothing was persisted, so
        // there's nothing to notify listeners about either.
      }
    },
    [clubId]
  );

  return { dismissedIds, dismiss };
}

// ─── Realtime ───────────────────────────────────────────────────────────────
// One channel, four listeners — reused verbatim by every page that shows
// the player's own reservations/requests, so no page reinvents this
// subscription or opens a second, competing one. Caller supplies onChange
// (typically `() => router.refresh()`, memoized so this effect doesn't
// resubscribe every render) — the actual refetch stays whatever mechanism
// that page already uses server-side.
export function usePlayerReservationsRealtime(onChange: () => void) {
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let lastNotificationId: string | null = null;
    let lastReservationEventKey: string | null = null;
    let lastParticipantEventKey: string | null = null;

    function onReservationChange(payload: { new: { id?: string; status?: string } | null }) {
      const row = payload.new;
      const key = row?.id && row?.status ? `${row.id}:${row.status}` : null;
      if (key && key === lastReservationEventKey) return;
      lastReservationEventKey = key;
      onChange();
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      channel = supabase
        .channel(`player-reservations:${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${user.id}` },
          (payload) => {
            const id = (payload.new as { id?: string } | null)?.id ?? null;
            if (id && id === lastNotificationId) return;
            lastNotificationId = id;
            onChange();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reservations", filter: `created_by=eq.${user.id}` },
          onReservationChange
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reservations", filter: `created_by=eq.${user.id}` },
          onReservationChange
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reservation_players", filter: `profile_id=eq.${user.id}` },
          (payload) => {
            const id = (payload.new as { id?: string } | null)?.id ?? null;
            if (id && id === lastParticipantEventKey) return;
            lastParticipantEventKey = id;
            onChange();
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [onChange]);
}

// ─── Activity status styling ────────────────────────────────────────────────
const ACTIVITY_STATUS: Record<
  MyReservation["status"],
  { label: string; dot: string; text: string; bg: string }
> = {
  pending: { label: "Pendiente", dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  confirmed: { label: "Aprobada", dot: "bg-brand-primary", text: "text-brand-primary", bg: "bg-brand-primary/10 border-brand-primary/20" },
  rejected: { label: "Rechazada", dot: "bg-red-400", text: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  // Not one of the panel's 3 primary states, but a player's own confirmed
  // reservation can later be cancelled by an admin — kept visible (never
  // silently dropped) rather than crashing on an unhandled status.
  cancelled: { label: "Cancelada", dot: "bg-red-400/60", text: "text-brand-muted", bg: "bg-white/[0.03] border-white/5" },
};

// ─── Cards ──────────────────────────────────────────────────────────────────

export function ActivityCard({
  reservation,
  clubSlug,
  isSelected,
  onDismiss,
}: {
  reservation: MyReservation;
  clubSlug: string;
  isSelected: boolean;
  onDismiss: (id: string) => void;
}) {
  const cfg = ACTIVITY_STATUS[reservation.status] ?? ACTIVITY_STATUS.pending;
  const start = reservation.start_time.slice(0, 5);
  const end = addMinutes(start, reservation.duration_minutes);
  const isRejected = reservation.status === "rejected";

  return (
    <Link
      href={activityHref(clubSlug, reservation.id)}
      className={`relative block rounded-lg border px-3 py-2.5 pr-7 transition-colors ${
        isSelected
          ? "border-brand-primary bg-brand-primary/5"
          : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
    >
      {/* Only rejected is dismissible — pending is still being processed and
          an active approved reservation is still upcoming, neither can be
          hidden manually, so neither renders a close button at all (never a
          disabled one). */}
      {isRejected && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss(reservation.id);
          }}
          aria-label="Cerrar tarjeta"
          className="absolute top-2 right-2 p-0.5 rounded text-brand-muted/50 hover:text-white transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${cfg.bg} ${cfg.text}`}
      >
        <span className={`w-1 h-1 rounded-full shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </span>
      <p className="text-xs text-white font-medium mt-1.5 capitalize truncate">
        {formatCompactDate(reservation.date)}
      </p>
      <p className="text-[11px] text-brand-muted mt-0.5 truncate">
        {reservation.courtName} · {start}–{end} · {durationLabel(reservation.duration_minutes)}
      </p>
      {isRejected && reservation.rejection_reason && (
        <p className="text-[11px] text-red-400/90 mt-1 line-clamp-2">{reservation.rejection_reason}</p>
      )}
    </Link>
  );
}

// Shared card list body — same compact style, same click-to-select
// behavior, reused everywhere "Mis reservas"/"Mis solicitudes" render so
// those never drift into different implementations of the same list.
export function ActivityList({
  reservations,
  clubSlug,
  selectedId,
  onDismiss,
  emptyMessage,
}: {
  reservations: MyReservation[];
  clubSlug: string;
  selectedId: string | null;
  onDismiss: (id: string) => void;
  emptyMessage: string;
}) {
  if (reservations.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-4 text-brand-muted/60">
        <Clock className="w-4 h-4 shrink-0" />
        <p className="text-xs">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {reservations.map((r) => (
        <ActivityCard
          key={r.id}
          reservation={r}
          clubSlug={clubSlug}
          isSelected={r.id === selectedId}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
