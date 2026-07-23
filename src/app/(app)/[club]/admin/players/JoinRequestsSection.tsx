"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { UserCheck } from "lucide-react";
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

// Sits above "Invitar jugadores"/"Compartir club" — requests are operational
// work waiting on the admin, invitations/sharing are just standing access
// already granted. Shows full history (not just pending) so Estado is
// meaningful; Aprobar/Rechazar only render for status === "pending" rows.
export function JoinRequestsSection({ clubId, clubSlug, requests }: JoinRequestsSectionProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startAction] = useTransition();

  if (requests.length === 0) return null;

  const pendingCount = requests.filter((r) => r.status === "pending").length;

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
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <UserCheck className="w-4 h-4 text-amber-400" />
        <h2 className="text-base font-semibold text-white">
          Solicitudes de ingreso {pendingCount > 0 && `(${pendingCount})`}
        </h2>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="flex flex-col gap-2">
        {requests.map((request) => {
          const name = request.full_name ?? "Sin nombre";
          const rowPending = isPending && pendingId === request.id;
          const badge = STATUS_BADGE[request.status];

          return (
            <div
              key={request.id}
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
                  <Button size="sm" loading={rowPending} onClick={() => handleApprove(request.id)}>
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rowPending}
                    onClick={() => handleReject(request.id)}
                  >
                    Rechazar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
