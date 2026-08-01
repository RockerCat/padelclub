"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { ChevronDown, UserCheck } from "lucide-react";
import { approveJoinRequest, rejectJoinRequest } from "./actions";

export type JoinRequestRow = {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

interface JoinRequestsSectionProps {
  clubId: string;
  clubSlug: string;
  requests: JoinRequestRow[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_BADGE: Record<JoinRequestRow["status"], { label: string; variant: "warning" | "success" | "danger" }> = {
  pending:  { label: "Pendiente",  variant: "warning" },
  approved: { label: "Aprobada",   variant: "success" },
  rejected: { label: "Rechazada",  variant: "danger" },
};

// Una sola fila, reutilizada tal cual tanto en la lista de pendientes
// (siempre visible) como dentro del acordeón de resueltas — Aprobar/
// Rechazar ya solo se muestran para status === "pending" (nunca aparecen en
// una fila resuelta), así que no hace falta una segunda variante.
function RequestRow({
  request,
  rowPending,
  onApprove,
  onReject,
}: {
  request: JoinRequestRow;
  rowPending: boolean;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}) {
  const name = request.full_name ?? "Sin nombre";
  const badge = STATUS_BADGE[request.status];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        request.status === "pending"
          ? "bg-amber-500/5 border-amber-500/20"
          : "bg-white/5 border-white/10"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-white truncate">{name}</p>
          <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
        </div>
        <p className="text-xs text-brand-muted truncate">
          {request.email ?? "—"} · {formatDate(request.created_at)}
        </p>
      </div>
      {request.status === "pending" && (
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" loading={rowPending} onClick={() => onApprove(request.id)}>
            Aprobar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={rowPending}
            onClick={() => onReject(request.id)}
          >
            Rechazar
          </Button>
        </div>
      )}
    </div>
  );
}

// Sits above "Invitar jugadores"/"Compartir club" — requests are operational
// work waiting on the admin, invitations/sharing are just standing access
// already granted. Pendientes quedan siempre visibles y prioritarias (piden
// una acción); aprobadas/rechazadas se agrupan dentro de un acordeón cerrado
// por defecto — nunca ocupan la carga inicial de la página — con el mismo
// patrón de disclosure hecho a mano que ya usa WithdrawnEntriesAccordion en
// Torneos (no existe un Accordion genérico en src/components/ui/).
export function JoinRequestsSection({ clubId, clubSlug, requests }: JoinRequestsSectionProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startAction] = useTransition();
  const [resolvedOpen, setResolvedOpen] = useState(false);

  if (requests.length === 0) return null;

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  function handleApprove(requestId: string) {
    setError(null);
    setPendingId(requestId);
    startAction(async () => {
      const result = await approveJoinRequest(clubId, requestId, clubSlug);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function handleReject(requestId: string) {
    setError(null);
    setPendingId(requestId);
    startAction(async () => {
      const result = await rejectJoinRequest(clubId, requestId, clubSlug);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="mb-8 flex flex-col gap-4">
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold text-white">
              Solicitudes de ingreso ({pending.length})
            </h2>
          </div>

          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          <div className="flex flex-col gap-2">
            {pending.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                rowPending={isPending && pendingId === request.id}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setResolvedOpen((v) => !v)}
            aria-expanded={resolvedOpen}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
          >
            <span className="text-sm font-medium text-white/80">Solicitudes resueltas ({resolved.length})</span>
            <ChevronDown
              className={`w-4 h-4 text-brand-muted shrink-0 transition-transform ${resolvedOpen ? "rotate-180" : ""}`}
            />
          </button>
          {resolvedOpen && (
            <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4" style={{ maxHeight: 360 }}>
              {resolved.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  rowPending={false}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
