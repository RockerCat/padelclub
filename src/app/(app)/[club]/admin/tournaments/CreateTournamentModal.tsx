"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { TournamentForm } from "./TournamentForm";
import { createTournament } from "./actions";
import type { Tournament, SportCategory } from "@/types/database";

interface CreateTournamentModalProps {
  clubSlug: string;
  clubId: string;
  categories: Pick<SportCategory, "code" | "sort_order">[];
  onClose: () => void;
  onSuccess: (tournament: Tournament | undefined) => void;
}

// Same modal shell as CreateCourtModal/ConfirmDialog (blurred backdrop,
// bg-[#082735] panel, bottom sheet on mobile).
export function CreateTournamentModal({
  clubSlug,
  clubId,
  categories,
  onClose,
  onSuccess,
}: CreateTournamentModalProps) {
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

  const boundCreate = createTournament.bind(null, clubId, clubSlug);

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
            <h2 className="text-base font-semibold text-white">Nuevo torneo</h2>
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
            <TournamentForm
              clubId={clubId}
              categories={categories}
              action={boundCreate}
              onSuccess={onSuccess}
              onCancel={onClose}
            />
          </div>
        </div>
      </div>
    </>
  );
}
