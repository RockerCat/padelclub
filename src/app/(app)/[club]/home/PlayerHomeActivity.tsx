"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import type { MyReservation } from "@/lib/playerReservations";
import {
  ActivityCard,
  ActivityList,
  sortBookingsByProximity,
  filterVisibleRequests,
  useDismissedReservationIds,
  usePlayerReservationsRealtime,
} from "@/components/reservations/PlayerActivity";

// The home page's operational core — "Mis próximas reservas" then "Mis
// solicitudes", reusing the exact same data rules, cards and dismissed-ids
// store as the Reservations page's side panel (@/components/reservations/
// PlayerActivity) so this can never drift into a second implementation.
// One Realtime subscription for the whole page — router.refresh() re-runs
// this Server Component page with fresh data from Supabase, same mechanism
// the Reservations page already uses.
export function PlayerHomeActivity({
  clubId,
  clubSlug,
  myBookings,
  myReservations,
}: {
  clubId: string;
  clubSlug: string;
  myBookings: MyReservation[];
  myReservations: MyReservation[];
}) {
  const router = useRouter();
  const { dismissedIds, dismiss } = useDismissedReservationIds(clubId);

  const handleRealtimeChange = useCallback(() => router.refresh(), [router]);
  usePlayerReservationsRealtime(handleRealtimeChange);

  const visibleBookings = sortBookingsByProximity(myBookings);
  const visibleRequests = filterVisibleRequests(myReservations, dismissedIds);

  return (
    <div className="flex flex-col gap-6">
      {/* Mis próximas reservas — always shown, empty state carries the
          primary "Reservar cancha" call to action. */}
      <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Mis próximas reservas</h2>
          <Link
            href={`/${clubSlug}/reservations`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "#001A24" }}
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Reservar cancha
          </Link>
        </div>
        {visibleBookings.length === 0 ? (
          <p className="text-xs text-brand-muted/70 py-2">Aún no tienes reservas próximas.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visibleBookings.map((r) => (
              <ActivityCard key={r.id} reservation={r} clubSlug={clubSlug} isSelected={false} onDismiss={dismiss} />
            ))}
          </div>
        )}
      </div>

      {/* Mis solicitudes — only rendered while something actually needs
          attention (pending, or a rejected one not yet dismissed); an empty
          "no requests" block would just be noise on a page whose whole
          point is prioritizing what's operative. */}
      {visibleRequests.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-brand-surface p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-white">Mis solicitudes</h2>
          <ActivityList
            reservations={visibleRequests}
            clubSlug={clubSlug}
            selectedId={null}
            onDismiss={dismiss}
            emptyMessage=""
          />
        </div>
      )}
    </div>
  );
}
