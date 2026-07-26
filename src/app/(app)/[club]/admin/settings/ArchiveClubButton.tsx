"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { archiveClub } from "./actions";

// OWNER-only "Archivar club" (Phase 8) — the single shared trigger +
// ConfirmDialog + archiveClub-calling logic. Server-side re-derives OWNER
// authorization regardless of the fact this button is already only ever
// rendered for role === "OWNER" (see SettingsModules) — never trusted from
// the client alone.
export function ArchiveClubButton({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClub(clubId);
      if (result.error) {
        setError(result.error);
        return;
      }

      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 p-5 rounded-2xl bg-brand-surface border border-red-500/20">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-red-400 shrink-0" />
          <h3 className="text-sm font-semibold text-white">Archivar club</h3>
        </div>
        <p className="text-xs text-brand-muted">
          El club dejará de aceptar nuevas reservas y solicitudes de ingreso. Toda la información histórica se conservará.
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
          className="self-start text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
        >
          Archivar club
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Archivar club"
        message={
          "El club dejará de aceptar nuevas reservas y solicitudes de ingreso. Toda la información histórica se conservará. Esta acción podrá revertirse en una futura funcionalidad." +
          (error ? `\n\n${error}` : "")
        }
        confirmLabel="Archivar club"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={pending}
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
