"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, MapPin } from "lucide-react";
import { Badge, Button, ConfirmDialog, Toast } from "@/components/ui";
import { CourtAllocationModal } from "./CourtAllocationModal";
import { deactivateTournamentCourtAllocationAction } from "@/lib/tournamentSchedulingActions";
import { formatMatchScheduleDate, formatMatchScheduleTimeRange } from "@/lib/tournamentBracket";
import type { TournamentCourtAllocationView } from "@/lib/tournamentBracket";

interface CourtAllocationsSectionProps {
  clubId: string;
  tournamentId: string;
  tournamentStatus: string;
  initialAllocations: TournamentCourtAllocationView[];
  courts: { id: string; name: string }[];
  revalidatePaths: string[];
}

// Audited (20260912000001): create/update only allowed in
// registration_closed/bracket_generated/in_progress. There is no
// "reactivate" RPC — deactivate_tournament_court_allocation only ever
// flips is_active to false, and both create/update require an existing
// row to be active already, so a deactivated allocation can never come
// back; getting the same slot again means creating a brand-new one. The
// UI never offers a "reactivar" action because the backend has none.
const MANAGEABLE_STATUSES = ["registration_closed", "bracket_generated", "in_progress"];

export function CourtAllocationsSection({
  clubId,
  tournamentId,
  tournamentStatus,
  initialAllocations,
  courts,
  revalidatePaths,
}: CourtAllocationsSectionProps) {
  const router = useRouter();
  const [allocations, setAllocations] = useState(initialAllocations);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<TournamentCourtAllocationView | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canManage = MANAGEABLE_STATUSES.includes(tournamentStatus);

  function handleModalSuccess() {
    setModalOpen(false);
    setEditingAllocation(null);
    setToastMessage(editingAllocation ? "Cancha actualizada correctamente" : "Cancha agregada correctamente");
    router.refresh();
  }

  function handleDeactivate() {
    if (!deactivatingId) return;
    setError(null);
    startTransition(async () => {
      const result = await deactivateTournamentCourtAllocationAction(clubId, deactivatingId, revalidatePaths);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAllocations((prev) => prev.map((a) => (a.id === deactivatingId ? { ...a, isActive: false } : a)));
      setDeactivatingId(null);
      setToastMessage("Cancha desactivada correctamente");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-semibold text-white">Canchas del torneo</h3>
        {canManage && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Agregar cancha
          </Button>
        )}
      </div>

      {allocations.length === 0 ? (
        <p className="text-sm text-brand-muted bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          {canManage
            ? "Aún no hay canchas asignadas a este torneo."
            : "Las canchas podrán asignarse cuando cierres las inscripciones."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allocations.map((a) => (
            <div
              key={a.id}
              className="bg-brand-surface border border-white/10 rounded-2xl p-3 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-white min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                  <span className="truncate">{a.courtName}</span>
                </span>
                <Badge variant={a.isActive ? "success" : "default"} size="sm">
                  {a.isActive ? "Activa" : "Inactiva"}
                </Badge>
              </div>
              <p className="text-xs text-brand-muted">
                {formatMatchScheduleDate(a.allocationDate)} · {formatMatchScheduleTimeRange(a.startTime, a.endTime)}
              </p>
              {a.isActive && canManage && (
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="secondary" onClick={() => setEditingAllocation(a)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setError(null);
                      setDeactivatingId(a.id);
                    }}
                  >
                    Desactivar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(modalOpen || editingAllocation) && (
        <CourtAllocationModal
          clubId={clubId}
          tournamentId={tournamentId}
          courts={courts}
          allocation={editingAllocation ?? undefined}
          revalidatePaths={revalidatePaths}
          onClose={() => {
            setModalOpen(false);
            setEditingAllocation(null);
          }}
          onSuccess={handleModalSuccess}
        />
      )}

      <ConfirmDialog
        open={!!deactivatingId}
        title="¿Desactivar esta cancha del torneo?"
        message={
          "Esta cancha dejará de estar disponible para nuevas asignaciones o programaciones. Los partidos ya programados no se ven afectados." +
          (error ? `\n\n${error}` : "")
        }
        confirmLabel="Desactivar"
        confirmVariant="danger"
        loading={pending}
        onConfirm={handleDeactivate}
        onCancel={() => {
          setDeactivatingId(null);
          setError(null);
        }}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
