"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, X } from "lucide-react";
import { approvePendingReservation, rejectPendingReservation, getAvailableSlots } from "../actions";
import type { PendingActionResult } from "../actions";
import { AvailabilityLegend, CourtAvailabilityCard } from "@/components/courts/CourtAvailabilityTimeline";
import type { Court } from "@/components/courts/CourtAvailabilityTimeline";
import { buildDayGrid, addMinutes } from "@/lib/courtAvailability";
import { durationLabel } from "@/lib/durations";

export type PendingReservationDetail = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  created_at: string;
  playerName: string | null;
};

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} de ${MONTH[d.getMonth()]}`;
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente de aprobación", className: "bg-amber-400/10 border-amber-400/20 text-amber-400" },
  confirmed: { label: "Confirmada", className: "bg-brand-primary/10 border-brand-primary/20 text-brand-primary" },
  cancelled: { label: "Rechazada", className: "bg-white/[0.03] border-white/5 text-brand-muted" },
};

// "Ya fue procesada" is returned verbatim by approvePendingReservation/
// rejectPendingReservation when another admin resolved it first — detected
// only to swap the action buttons for a neutral notice, never to
// re-implement that decision here.
const ALREADY_RESOLVED_ERROR = "La solicitud ya fue procesada.";

// Matches PendingRequestsSection's Confirmar/Rechazar spinner exactly — same
// approve/reject affordance, just scaled up for a page-level footer.
function Spinner() {
  return <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />;
}

export function PendingReservationReview({
  clubId,
  clubSlug,
  reservation,
  court,
  grid: initialGrid,
  slots: initialSlots,
}: {
  clubId: string;
  clubSlug: string;
  reservation: PendingReservationDetail;
  court: Court;
  grid: string[];
  slots: string[];
}) {
  const router = useRouter();
  const [grid, setGrid] = useState(initialGrid);
  const [slots, setSlots] = useState(initialSlots);
  const [error, setError] = useState<string | null>(null);
  const [resolvedElsewhere, setResolvedElsewhere] = useState(false);
  const [isApproving, startApprove] = useTransition();
  const [isRejecting, startReject] = useTransition();
  const isPending = isApproving || isRejecting;

  const start = reservation.start_time.slice(0, 5);
  const end = addMinutes(start, reservation.duration_minutes);
  const requestedRange = { startTime: start, duration: reservation.duration_minutes };
  const statusCfg = STATUS_LABEL[reservation.status] ?? STATUS_LABEL.pending;

  function handleApprove() {
    setError(null);
    startApprove(async () => {
      const result: PendingActionResult = await approvePendingReservation(clubId, reservation.id);
      if (result.success) {
        router.push(`/${clubSlug}/admin/reservations`);
        return;
      }

      setError(result.error ?? "No se pudo aprobar la reserva.");
      if (result.error === ALREADY_RESOLVED_ERROR) setResolvedElsewhere(true);

      // Availability changed under us — re-query Supabase (not the stale
      // props from page load) so the timeline reflects what's true now,
      // never what the admin merely assumed when they opened the page.
      const fresh = await getAvailableSlots(clubId, court.id, reservation.date, reservation.duration_minutes, reservation.id);
      setSlots(fresh.slots);
      setGrid(buildDayGrid(fresh.openMins, fresh.closeMins, reservation.duration_minutes));
      router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    startReject(async () => {
      const result: PendingActionResult = await rejectPendingReservation(clubId, reservation.id);
      if (result.success) {
        router.push(`/${clubSlug}/admin/reservations`);
        return;
      }
      setError(result.error ?? "No se pudo rechazar la solicitud.");
      if (result.error === ALREADY_RESOLVED_ERROR) setResolvedElsewhere(true);
      router.refresh();
    });
  }

  return (
    <div className="p-6 md:p-10 pb-28 md:pb-10 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-4">Solicitud de reserva</h1>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2.5">
          <div className="flex justify-between text-sm gap-4">
            <span className="text-brand-muted">Jugador</span>
            <span className="text-white font-medium text-right">{reservation.playerName ?? "Jugador"}</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-brand-muted">Fecha</span>
            <span className="text-white font-medium capitalize text-right">{formatFullDate(reservation.date)}</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-brand-muted">Horario solicitado</span>
            <span className="text-white font-medium text-right">{start} – {end}</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-brand-muted">Duración</span>
            <span className="text-white font-medium text-right">{durationLabel(reservation.duration_minutes)}</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-brand-muted">Estado</span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-brand-muted">Solicitada el</span>
            <span className="text-white font-medium text-right capitalize">{formatCreatedAt(reservation.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <AvailabilityLegend showRequested />
        <CourtAvailabilityCard
          court={court}
          grid={grid}
          slots={slots}
          requestedRange={requestedRange}
          interactive={false}
        />
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400 font-medium">
              {resolvedElsewhere ? "Esta solicitud ya fue resuelta" : "La disponibilidad cambió"}
            </p>
            <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!resolvedElsewhere && reservation.status === "pending" && (
        <div className="fixed md:static bottom-0 inset-x-0 md:inset-auto z-40 md:z-auto bg-brand-bg md:bg-transparent border-t md:border-t-0 border-white/10 p-4 md:p-0 flex gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleReject}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border border-white/20 text-brand-muted hover:text-white hover:border-white/40 transition-colors disabled:opacity-40"
          >
            {isRejecting ? <Spinner /> : <X className="w-4 h-4" />}
            Rechazar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleApprove}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-40"
          >
            {isApproving ? <Spinner /> : <Check className="w-4 h-4" />}
            Aprobar reserva
          </button>
        </div>
      )}
    </div>
  );
}
