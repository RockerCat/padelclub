"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, X, Clock, Eye } from "lucide-react";
import { approvePendingReservation, rejectPendingReservation } from "./actions";
import type { PendingActionResult } from "./actions";
import { durationLabel } from "@/lib/durations";
import { RejectReservationModal } from "./RejectReservationModal";
import type { RejectionReasonCode } from "@/lib/reservationRejection";

// Returned verbatim by approvePendingReservation/rejectPendingReservation
// when another admin resolved it first — detected only to react to that
// outcome (close the modal, let the router refresh show the real state),
// never to re-implement the decision here.
const ALREADY_RESOLVED_ERROR = "La solicitud ya fue procesada.";

export type PendingRequest = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  court_id: string;
  courtName: string;
  // The real requester (reservations.created_by) — a pending request is
  // always self-requested by the player themselves (requestReservation),
  // never an admin/owner, so this is a genuine participant relationship,
  // not an inference. Used to resolve their avatar/initials the same way
  // a confirmed reservation's players are resolved.
  playerId: string | null;
  playerName: string | null;
  // Frozen at request time (reservations.price_amount/price_currency) —
  // shown as-is, never recalculated here. Null for requests predating the
  // pricing engine or with no tariff applicable at request time.
  price_amount: number | null;
  price_currency: string | null;
};

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function Spinner() {
  return (
    <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
  );
}

function PendingCard({
  request,
  clubId,
  clubSlug,
  onDone,
}: {
  request: PendingRequest;
  clubId: string;
  clubSlug: string;
  onDone: () => void;
}) {
  const [isApproving, startApprove] = useTransition();
  const [isRejecting, startReject] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const isPending = isApproving || isRejecting;

  function handleApprove() {
    setError(null);
    startApprove(async () => {
      const result: PendingActionResult = await approvePendingReservation(clubId, request.id);
      if (result.success) onDone();
      else setError(result.error ?? "Error al confirmar.");
    });
  }

  function handleRejectConfirm(reasonCode: RejectionReasonCode, comment: string) {
    setRejectError(null);
    startReject(async () => {
      const result: PendingActionResult = await rejectPendingReservation(
        clubId,
        request.id,
        reasonCode,
        comment
      );
      if (result.success) {
        setRejectModalOpen(false);
        onDone();
        return;
      }
      if (result.error === ALREADY_RESOLVED_ERROR) {
        setRejectModalOpen(false);
        setError(result.error);
        onDone();
        return;
      }
      // Keep the modal open with its content intact so the admin can retry
      // without re-selecting the reason or retyping the comment.
      setRejectError(result.error ?? "Error al rechazar.");
    });
  }

  const start = request.start_time.slice(0, 5);
  const end = calcEndTime(request.start_time, request.duration_minutes);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-medium truncate">
            {request.playerName ?? "Jugador"}
          </p>
          <p className="text-sm text-brand-muted mt-0.5">
            {formatDate(request.date)} · {request.courtName}
          </p>
          <p className="text-sm text-brand-muted">
            {start} – {end} · {durationLabel(request.duration_minutes)}
          </p>
          {request.price_amount != null && request.price_currency && (
            <p className="text-sm text-white font-medium mt-0.5">
              Valor: {formatCurrency(request.price_amount, request.price_currency)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href={`/${clubSlug}/admin/reservations/${request.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-white/20 text-brand-muted hover:text-white hover:border-white/40 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Revisar
          </Link>
          <button
            onClick={() => setRejectModalOpen(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-white/20 text-brand-muted hover:text-white hover:border-white/40 transition-colors disabled:opacity-40"
          >
            {isRejecting ? <Spinner /> : <X className="w-3.5 h-3.5" />}
            Rechazar
          </button>
          <button
            onClick={handleApprove}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-40"
          >
            {isApproving ? <Spinner /> : <Check className="w-3.5 h-3.5" />}
            Confirmar
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
      {rejectModalOpen && (
        <RejectReservationModal
          pending={isRejecting}
          error={rejectError}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectModalOpen(false)}
        />
      )}
    </div>
  );
}

export function PendingRequestsSection({
  requests,
  clubId,
  clubSlug,
}: {
  requests: PendingRequest[];
  clubId: string;
  clubSlug: string;
}) {
  const router = useRouter();

  if (requests.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-amber-400" />
        <h2 className="text-base font-semibold text-white">Solicitudes pendientes</h2>
        <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-400 text-xs font-medium">
          {requests.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {requests.map((req) => (
          <PendingCard
            key={req.id}
            request={req}
            clubId={clubId}
            clubSlug={clubSlug}
            onDone={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}
