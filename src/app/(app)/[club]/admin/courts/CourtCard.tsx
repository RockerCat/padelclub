"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Settings, Trash2 } from "lucide-react";
import { Switch, ConfirmDialog, ContextMenu, Toast, type ContextMenuAction } from "@/components/ui";
import { CourtIllustration, getSurfaceLabel } from "@/components/courts/CourtIllustration";
import { CourtForm } from "./CourtForm";
import { updateCourt, toggleCourtActive, deleteCourt } from "./actions";
import type { Court } from "@/types/database";

interface CourtCardProps {
  court: Court;
  clubSlug: string;
  clubId: string;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

// Quick status toggle reuses the same toggleCourtActive action and
// useTransition + router.refresh() pattern as [id]/ToggleActiveButton.tsx —
// now behind a Switch + ConfirmDialog instead of a native window.confirm(),
// with a success Toast once the change lands. The same Toast is reused for
// the inline edit form's save flow — saving successfully collapses the card
// automatically instead of leaving it open waiting for "Cancelar".
export function CourtCard({
  court,
  clubSlug,
  clubId,
  isExpanded,
  onExpand,
  onCollapse,
}: CourtCardProps) {
  const router = useRouter();
  const [togglePending, startToggle] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  const typeLine = [
    getSurfaceLabel(court.surface),
    court.is_indoor === true ? "Interior" : court.is_indoor === false ? "Exterior" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function handleConfirmToggle() {
    const turningOn = !court.is_active;
    startToggle(async () => {
      const result = await toggleCourtActive(clubId, court.id, turningOn);
      setConfirmOpen(false);
      if (!result.error) {
        setToastMessage(turningOn ? "Cancha activada correctamente" : "Cancha desactivada correctamente");
      }
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteCourt(clubId, court.id);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      setToastMessage("Cancha eliminada correctamente");
      router.refresh();
    });
  }

  const menuActions: ContextMenuAction[] = [
    { label: "Configurar cancha", icon: Settings, onClick: onExpand },
    {
      label: "Eliminar cancha",
      icon: Trash2,
      variant: "danger",
      onClick: () => {
        setDeleteError(null);
        setDeleteOpen(true);
      },
    },
  ];

  const boundUpdate = updateCourt.bind(null, clubId, court.id);

  function handleFormSuccess() {
    setToastMessage("Cambios guardados correctamente");
    onCollapse();
  }

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 transition-colors">
      {/* Quick actions — status switch + overflow menu */}
      <div className="flex items-center justify-end gap-2.5 -mt-1 -mr-1 mb-1" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs font-medium text-brand-muted">
          {court.is_active ? "Activa" : "Inactiva"}
        </span>
        <Switch
          checked={court.is_active}
          onChange={() => setConfirmOpen(true)}
          disabled={togglePending}
          label={court.is_active ? "Marcar como inactiva" : "Marcar como activa"}
        />
        <ContextMenu actions={menuActions} triggerLabel={`Más acciones de ${court.name}`} />
      </div>

      <button
        type="button"
        onClick={isExpanded ? undefined : onExpand}
        className="w-full text-left"
      >
        <CourtIllustration surface={court.surface} className="w-full max-w-[200px] mx-auto mb-4" />

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white uppercase tracking-wide truncate">
            {court.name}
          </span>
        </div>
        <p className="text-xs text-brand-muted mt-0.5">{typeLine}</p>
      </button>

      {!isExpanded && (
        <button
          type="button"
          onClick={onExpand}
          className="flex items-center gap-1 text-xs font-medium text-brand-primary mt-4 pt-3 border-t border-white/[0.06] w-full"
        >
          Configurar cancha
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <CourtForm
            clubSlug={clubSlug}
            clubId={clubId}
            court={court}
            action={boundUpdate}
            variant="inline"
            onSuccess={handleFormSuccess}
            onCancel={onCollapse}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={court.is_active ? "Desactivar cancha" : "Activar cancha"}
        message={
          court.is_active
            ? "¿Deseas desactivar esta cancha?\nLa cancha dejará de estar disponible para nuevas reservas."
            : "¿Deseas activar esta cancha?\nLa cancha volverá a estar disponible para reservas."
        }
        confirmLabel={court.is_active ? "Desactivar cancha" : "Activar cancha"}
        confirmVariant={court.is_active ? "danger" : "success"}
        loading={togglePending}
        onConfirm={handleConfirmToggle}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Eliminar cancha"
        message={
          `${court.name}${typeLine ? ` · ${typeLine}` : ""}\n\n` +
          "Esta acción eliminará permanentemente la cancha y su configuración. Solo es posible porque no tiene reservas ni actividad registrada.\n\n" +
          "Esta acción no se puede deshacer." +
          (deleteError ? `\n\n${deleteError}` : "")
        }
        confirmLabel="Eliminar cancha"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={deletePending}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
