"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CourtPreviewCard } from "@/components/courts/CourtPreviewCard";
import { CourtForm } from "./CourtForm";
import { createCourt } from "./actions";

interface CreateCourtModalProps {
  clubSlug: string;
  clubId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// Same modal shell as ReservationModal/ConfirmDialog (blurred backdrop,
// bg-[#082735] panel, bottom sheet on mobile). The form itself is the exact
// same CourtForm used by the standalone /courts/new page and the inline
// edit cards — just in "inline" mode so it doesn't navigate on success.
//
// The caller only renders this component while the modal should be open
// ({open && <CreateCourtModal .../>}) — mounting/unmounting is what opens
// and closes it, so preview state always starts fresh with no reset effect.
export function CreateCourtModal({
  clubSlug,
  clubId,
  onClose,
  onSuccess,
}: CreateCourtModalProps) {
  const [previewName, setPreviewName] = useState("");
  const [previewSurface, setPreviewSurface] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const boundCreate = createCourt.bind(null, clubId);

  // Event delegation instead of controlling CourtForm's inputs — keeps
  // CourtForm untouched (same defaultValue-based fields, same validation)
  // while still reacting to name/surface changes for the live preview.
  function handleFieldsChange(e: React.ChangeEvent<HTMLDivElement>) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (target.name === "name") setPreviewName(target.value);
    if (target.name === "surface") setPreviewSurface(target.value);
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[720px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">Nueva cancha</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-start" onChange={handleFieldsChange}>
              <CourtForm
                clubSlug={clubSlug}
                clubId={clubId}
                action={boundCreate}
                variant="inline"
                onSuccess={onSuccess}
                onCancel={onClose}
              />

              <CourtPreviewCard name={previewName} surface={previewSurface} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
