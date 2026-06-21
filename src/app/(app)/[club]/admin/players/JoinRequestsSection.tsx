"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { UserCheck } from "lucide-react";
import { approveJoinRequest, rejectJoinRequest } from "./actions";

export type JoinRequestRow = {
  id: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

interface JoinRequestsSectionProps {
  clubId: string;
  clubSlug: string;
  requests: JoinRequestRow[];
}

function formatRelative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Solicitada hoy";
  if (days === 1) return "Solicitada hace 1 día";
  return `Solicitada hace ${days} días`;
}

// Sits above "Invitar jugadores" — requests are operational work waiting on
// the admin, while invitations are just standing access the admin already
// granted. Each request row is implicitly "pending"; approving inserts a
// club_members row and deletes the request, rejecting just deletes it.
export function JoinRequestsSection({ clubId, clubSlug, requests }: JoinRequestsSectionProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startAction] = useTransition();

  if (requests.length === 0) return null;

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
          Solicitudes de ingreso ({requests.length})
        </h2>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="flex flex-col gap-2">
        {requests.map((request) => {
          const name = request.profiles?.full_name ?? "Sin nombre";
          const rowPending = isPending && pendingId === request.id;

          return (
            <div
              key={request.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{name}</p>
                <p className="text-xs text-brand-muted">{formatRelative(request.created_at)}</p>
              </div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
