"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Toast } from "@/components/ui";
import { CreateCourtModal } from "./CreateCourtModal";

interface CreateCourtButtonProps {
  clubSlug: string;
  clubId: string;
  className?: string;
}

const DEFAULT_BUTTON_CLASS =
  "inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 shrink-0";

// Replaces the old Link to /admin/courts/new — creating a court is a quick
// operation, so it now happens in a modal without leaving this page.
// CourtForm's own onSuccess effect already calls router.refresh(), so the
// fresh court list (courts/page.tsx) picks up the new court as soon as the
// modal closes.
export function CreateCourtButton({ clubSlug, clubId, className }: CreateCourtButtonProps) {
  const [open, setOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function handleSuccess() {
    setOpen(false);
    setToastMessage("Cancha creada correctamente");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? DEFAULT_BUTTON_CLASS}
      >
        <Plus className="w-4 h-4" />
        Crear cancha
      </button>

      {open && (
        <CreateCourtModal
          clubSlug={clubSlug}
          clubId={clubId}
          onClose={() => setOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
