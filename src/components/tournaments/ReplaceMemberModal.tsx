"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Spinner } from "@/components/ui";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { PlayerCombobox, type PlayerComboboxCandidate } from "./PlayerCombobox";
import { replaceTournamentEntryMemberAction } from "@/lib/tournamentEntryActions";
import { getTournamentCandidates } from "../../../shared/tournaments/candidates";
import type { TournamentEntryMemberDisplay } from "@/lib/tournamentEntries";

interface ReplaceMemberModalProps {
  clubId: string;
  tournamentEntryId: string;
  category: string;
  secondaryCategory: string | null;
  members: TournamentEntryMemberDisplay[];
  excludeClubMemberIds: string[];
  revalidatePaths: string[];
  onClose: () => void;
  onSuccess: () => void;
}

// Reemplazo/corrección de integrante — deliberadamente sin mostrar
// historial ni auditoría al organizador (CLAUDE.md → Tournament Module
// Principles): solo "quién sale" y "quién entra". La dupla conserva sus
// puntos sin ningún cambio visible aquí — no hay nada de puntos en este
// modal porque replace_tournament_entry_member no los toca.
export function ReplaceMemberModal({
  clubId,
  tournamentEntryId,
  category,
  secondaryCategory,
  members,
  excludeClubMemberIds,
  revalidatePaths,
  onClose,
  onSuccess,
}: ReplaceMemberModalProps) {
  const [outgoingId, setOutgoingId] = useState<string | null>(members.length === 1 ? members[0].club_member_id : null);
  const [incomingId, setIncomingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlayerComboboxCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const categoriesToLoad = secondaryCategory ? [category, secondaryCategory] : [category];

    getTournamentCandidates(supabase, clubId, categoriesToLoad).then(({ candidates: result, error }) => {
      if (cancelled) return;
      if (error) {
        setLoadError(error);
        return;
      }
      setCandidates(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit() {
    setError(null);
    if (!outgoingId) {
      setError("Selecciona qué jugador sale de la dupla.");
      return;
    }
    if (!incomingId) {
      setError("Selecciona al jugador que entra.");
      return;
    }
    startTransition(async () => {
      const result = await replaceTournamentEntryMemberAction(
        clubId,
        tournamentEntryId,
        outgoingId,
        incomingId,
        revalidatePaths
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess();
    });
  }

  const excludeIds = [...excludeClubMemberIds, ...members.map((m) => m.club_member_id)];

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
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">Cambiar jugadores</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/80">¿Quién sale de la dupla?</label>
              {members.map((m) => (
                <button
                  key={m.club_member_id}
                  type="button"
                  onClick={() => setOutgoingId(m.club_member_id)}
                  className={`flex items-center gap-2.5 h-12 px-3 rounded-xl border transition-colors ${
                    outgoingId === m.club_member_id
                      ? "border-brand-primary bg-brand-primary/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <PlayerSportAvatar
                    player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }}
                    size="sm"
                    sportCategory={m.category}
                  />
                  <span className="text-sm text-white">{m.full_name ?? "Jugador"}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80">¿Quién entra?</label>
              {candidates === null && !loadError && (
                <div className="flex items-center justify-center py-6">
                  <Spinner />
                </div>
              )}
              {loadError && <p className="text-sm text-red-400">{loadError}</p>}
              {candidates !== null && (
                <PlayerCombobox
                  label=""
                  candidates={candidates}
                  excludeIds={excludeIds}
                  value={incomingId}
                  onChange={setIncomingId}
                  disabled={!outgoingId}
                />
              )}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
            )}
          </div>

          <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10 shrink-0">
            <Button type="button" loading={pending} onClick={handleSubmit} disabled={candidates === null}>
              Reemplazar
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
