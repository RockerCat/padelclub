"use client";

import { useState, useTransition } from "react";
import { Power } from "lucide-react";
import { Button, ConfirmDialog, Toast } from "@/components/ui";
import { reactivateClub } from "./actions";

// SUPERADMIN-only, counterpart to DeactivateClubButton. Only ever rendered
// by the parent page when club.is_active is false.
export function ReactivateClubButton({ clubId }: { clubId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await reactivateClub(clubId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      setToastMessage("Club reactivado correctamente");
    });
  }

  return (
    <>
      <Button
        variant="success"
        className="justify-between w-full sm:w-auto"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
      >
        <span className="flex items-center gap-2">
          <Power className="w-4 h-4" />
          Reactivar club
        </span>
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Reactivar este club?"
        message={
          "El club volverá a estar disponible para propietarios, administradores y jugadores, y recuperará su operación normal." +
          (error ? `\n\n${error}` : "")
        }
        confirmLabel="Reactivar club"
        cancelLabel="Cancelar"
        confirmVariant="success"
        loading={pending}
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
