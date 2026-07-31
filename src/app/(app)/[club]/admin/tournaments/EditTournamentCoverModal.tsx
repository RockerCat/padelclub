"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { TournamentImageUpload } from "./TournamentImageUpload";
import { updateTournamentCoverImage, type TournamentActionState } from "./actions";
import type { Tournament } from "@/types/database";

interface EditTournamentCoverModalProps {
  clubId: string;
  tournamentId: string;
  tournamentSlug: string;
  clubSlug: string;
  currentImageUrl: string | null;
  onClose: () => void;
  onSuccess: (tournament: Tournament | undefined) => void;
}

const initialState: TournamentActionState = {};

// Único modal dedicado exclusivamente a la portada — deliberadamente
// separado del formulario general de edición (TournamentForm), que solo
// está disponible en draft/registration_open/registration_closed. Este
// modal reutiliza TournamentImageUpload tal cual (mismo bucket, misma
// subida, sin duplicar lógica) y llama a updateTournamentCoverImage, el
// único server action/RPC sin bloqueo de estado — nunca toca nombre,
// fechas, categoría, cupo ni ningún otro campo del torneo.
export function EditTournamentCoverModal({
  clubId,
  tournamentId,
  tournamentSlug,
  clubSlug,
  currentImageUrl,
  onClose,
  onSuccess,
}: EditTournamentCoverModalProps) {
  const boundAction = updateTournamentCoverImage.bind(null, clubId, tournamentId, tournamentSlug, clubSlug);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (!state.success) return;
    onSuccess(state.tournament);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

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
          className="pointer-events-auto w-full md:w-[480px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-base font-semibold text-white">Editar portada</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form action={formAction} className="px-5 py-5 flex flex-col gap-4">
            <TournamentImageUpload clubId={clubId} currentImageUrl={currentImageUrl} />

            {state.error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {state.error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" loading={pending}>
                Guardar portada
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
