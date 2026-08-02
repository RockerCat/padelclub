"use client";

import { useState, useTransition } from "react";
import { Power } from "lucide-react";
import { Button, ConfirmDialog } from "@/components/ui";
import { deactivateClub } from "./actions";

// SUPERADMIN-only. Only ever rendered by the parent page when
// club.is_active is true — reactivation isn't implemented yet, so once
// deactivated this slot simply disappears (no disabled placeholder).
export function DeactivateClubButton({ clubId }: { clubId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deactivateClub(clubId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="danger"
        className="justify-between w-full sm:w-auto"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
      >
        <span className="flex items-center gap-2">
          <Power className="w-4 h-4" />
          Desactivar club
        </span>
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Desactivar este club?"
        message={
          "El club dejará de estar disponible para jugadores y administradores. No se eliminarán datos y podrá reactivarse posteriormente." +
          (error ? `\n\n${error}` : "")
        }
        confirmLabel="Desactivar club"
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
