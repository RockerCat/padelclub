"use client";

import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { PendingReservationJoinRequest } from "@/lib/reservationJoinRequests";

// Lista de solicitudes pendientes para unirse (aprobar/rechazar) — mismo
// componente para ReservationTicketPanel (modal OWNER/ADMIN) y
// ReservationShareView (detalle compartido), en vez de la misma fila
// (avatar + nombre + Rechazar/Aprobar) repetida en ambos. El caller sigue
// siendo dueño de la lista y de los handlers (vía useReservationJoinManagement)
// — este componente es puramente presentacional.
export function PendingJoinRequestsList({
  requests,
  resolving,
  resolvingRequestId,
  onApprove,
  onReject,
  error,
}: {
  requests: PendingReservationJoinRequest[];
  resolving: boolean;
  resolvingRequestId: string | null;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  error: string | null;
}) {
  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col">
      {requests.map((req) => (
        <div key={req.id} className="flex items-center gap-2.5 py-2.5 border-b border-white/5 last:border-0">
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <PlayerAvatar player={{ id: req.profile_id, full_name: req.full_name, avatar_url: req.avatar_url }} size="sm" />
            <span className="text-sm text-white truncate">{req.full_name ?? "Jugador"}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onReject(req.id)}
              disabled={resolving}
              className="h-8 px-3 rounded-lg border border-white/15 text-xs font-medium text-brand-muted hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
            >
              Rechazar
            </button>
            <button
              type="button"
              onClick={() => onApprove(req.id)}
              disabled={resolving}
              className="h-8 px-3 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
            >
              {resolving && resolvingRequestId === req.id ? "…" : "Aprobar"}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="pt-2 pb-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
