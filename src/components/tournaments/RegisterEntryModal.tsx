"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Spinner } from "@/components/ui";
import type { PlayerComboboxCandidate } from "./PlayerCombobox";
import { PlayerTransferList } from "./PlayerTransferList";
import { registerTournamentEntryAction } from "@/lib/tournamentEntryActions";
import { tournamentCategoryLabel } from "@/lib/tournamentLabels";
import { getTournamentCandidates, companionCandidates as sharedCompanionCandidates } from "../../../shared/tournaments/candidates";
import type { TournamentEntryRow } from "@/types/database";

interface RegisterEntryModalProps {
  clubId: string;
  tournamentId: string;
  category: string;
  // Bloque 2.2.1A — when set, candidates are combined from both categories.
  // Hotfix 2.2.1B: the composition rule (H+L/L+H/L+L, never H+H, never a
  // category outside {H, L}) is now enforced both here (UI, via candidate
  // filtering — never a security boundary) and in register_tournament_entry
  // (the real authority).
  secondaryCategory: string | null;
  excludeClubMemberIds: string[];
  revalidatePaths: string[];
  // Player mode auto-includes the caller as one of the two members and
  // hides that slot from selection entirely (spec: "no poder removerse del
  // formulario"). Admin mode shows two free selectors.
  mode:
    | { type: "admin" }
    | {
        type: "player";
        ownClubMemberId: string;
        ownFullName: string | null;
        ownAvatarUrl: string | null;
        // Bloque 3.3 — ya resuelta por el padre (EntriesSection.ownCategory),
        // nunca una consulta nueva aquí.
        ownCategory: string | null;
      };
  onClose: () => void;
  // Segundo argumento: los dos jugadores ya seleccionados (nombre/avatar/
  // categoría reales, no solo ids) — permite al llamador construir de
  // inmediato una tarjeta completa sin esperar el próximo refetch del
  // servidor ni volver a consultar perfiles.
  onSuccess: (entry: TournamentEntryRow | undefined, selectedMembers: PlayerComboboxCandidate[]) => void;
}

export function RegisterEntryModal({
  clubId,
  tournamentId,
  category,
  secondaryCategory,
  excludeClubMemberIds,
  revalidatePaths,
  mode,
  onClose,
  onSuccess,
}: RegisterEntryModalProps) {
  const [candidates, setCandidates] = useState<PlayerComboboxCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memberOneId, setMemberOneId] = useState<string | null>(mode.type === "player" ? mode.ownClubMemberId : null);
  const [memberTwoId, setMemberTwoId] = useState<string | null>(null);
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
    // One call per category the tournament accepts (max 2, never a query
    // per player) — combined tournaments must offer candidates from BOTH
    // category/secondaryCategory, not just the primary one.
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

  function categoryOf(id: string | null): string | undefined {
    if (!id || !candidates) return undefined;
    return candidates.find((c) => c.club_member_id === id)?.category;
  }

  // Composition rule — shared/tournaments/candidates.ts (misma que
  // register_tournament_entry aplica server-side, esto es solo UX).
  function companionCandidates(firstMemberId: string | null): PlayerComboboxCandidate[] {
    if (!candidates) return [];
    return sharedCompanionCandidates(candidates, categoryOf(firstMemberId) ?? null, category, secondaryCategory);
  }

  const excludeIds = mode.type === "player" ? [...excludeClubMemberIds, mode.ownClubMemberId] : excludeClubMemberIds;

  // Lista de transferencia — único componente para construir una dupla,
  // reutilizado tal cual por ambos modos (la diferencia es solo de props,
  // ver el render más abajo). El orden de selección decide quién es
  // memberOneId/memberTwoId ("primer seleccionado → Jugador 1"), y en
  // modo jugador memberOneId ya arranca fijo en mode.ownClubMemberId
  // (nunca cambia), así que esta misma derivación lo deja siempre primero
  // y ya resuelto desde `candidates` — nunca una segunda fuente de
  // elegibilidad ni una consulta aparte para el propio jugador.
  const selectedIds = [memberOneId, memberTwoId].filter((id): id is string => !!id);
  const availablePool = memberOneId === null ? candidates ?? [] : companionCandidates(memberOneId);
  const transferAvailableCandidates = availablePool.filter(
    (c) => !excludeIds.includes(c.club_member_id) && !selectedIds.includes(c.club_member_id)
  );
  const transferSelectedPlayers = selectedIds
    .map((id) => (candidates ?? []).find((c) => c.club_member_id === id))
    .filter((c): c is PlayerComboboxCandidate => !!c);

  function handleTransferSelect(id: string) {
    if (memberOneId === null) {
      setMemberOneId(id);
    } else if (memberTwoId === null) {
      setMemberTwoId(id);
    }
  }

  function handleTransferDeselect(id: string) {
    // El propio jugador nunca se quita a sí mismo — defensa adicional,
    // ya que su fila ni siquiera expone un control clickeable para esto.
    if (mode.type === "player" && id === mode.ownClubMemberId) return;
    if (id === memberOneId) {
      // El segundo seleccionado (si existe) pasa a ser el único
      // seleccionado — nunca dos huecos sueltos, y companionCandidates()
      // se vuelve a evaluar sobre él en el próximo render.
      setMemberOneId(memberTwoId);
      setMemberTwoId(null);
    } else if (id === memberTwoId) {
      setMemberTwoId(null);
    }
  }

  function handleSubmit() {
    setError(null);
    if (!memberOneId || !memberTwoId) {
      setError(mode.type === "player" ? "Selecciona a tu partner." : "Selecciona a los dos jugadores.");
      return;
    }
    if (memberOneId === memberTwoId) {
      setError("Los dos jugadores deben ser distintos.");
      return;
    }
    startTransition(async () => {
      const result = await registerTournamentEntryAction(clubId, tournamentId, memberOneId, memberTwoId, revalidatePaths);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess(result.entry, transferSelectedPlayers);
    });
  }

  const helpText = secondaryCategory
    ? `Puedes registrar una dupla formada por una persona de ${category} y una de ${secondaryCategory}, o por dos personas de ${secondaryCategory}. No se permiten dos jugadores de ${category}.`
    : `Ambos jugadores deben pertenecer a la categoría ${category}.`;

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
          className="pointer-events-auto w-full md:w-[560px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">Registrar dupla</h2>
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
            <p className="text-xs text-brand-muted bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">{helpText}</p>

            {candidates === null && !loadError && (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            )}

            {loadError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{loadError}</p>
            )}

            {candidates !== null && (
              <>
                <PlayerTransferList
                  availableCandidates={transferAvailableCandidates}
                  selectedPlayers={transferSelectedPlayers}
                  onSelect={handleTransferSelect}
                  onDeselect={handleTransferDeselect}
                  lockedPlayerIds={mode.type === "player" ? [mode.ownClubMemberId] : []}
                  panelTitle={mode.type === "player" ? "Tu dupla" : "Dupla seleccionada"}
                  partnerHintText={mode.type === "player" ? "Selecciona tu partner." : undefined}
                />

                {candidates.length === 0 && (
                  <p className="text-xs text-brand-muted">
                    No hay jugadores disponibles en la categoría {tournamentCategoryLabel(category, secondaryCategory)} para
                    inscribirse.
                  </p>
                )}
              </>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
            )}
          </div>

          <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10 shrink-0">
            <Button
              type="button"
              loading={pending}
              onClick={handleSubmit}
              disabled={candidates === null || !memberOneId || !memberTwoId || memberOneId === memberTwoId}
            >
              Registrar dupla
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
