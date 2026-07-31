"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trophy } from "lucide-react";
import { TournamentCard } from "./TournamentCard";
import { CreateTournamentModal } from "./CreateTournamentModal";
import type { Tournament, SportCategory } from "@/types/database";

interface TournamentsGridProps {
  tournaments: Tournament[];
  confirmedCountByTournamentId?: Record<string, number>;
  categories: Pick<SportCategory, "code" | "sort_order">[];
  clubSlug: string;
  clubId: string;
}

export function TournamentsGrid({
  tournaments,
  confirmedCountByTournamentId,
  categories,
  clubSlug,
  clubId,
}: TournamentsGridProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  // Preference per spec: navigate straight to the new tournament's detail
  // page rather than staying on the list — the success toast is shown there
  // (?created=1, consumed once by TournamentDetailView) since the list is
  // left immediately, not refreshed in place. Detail lives at the canonical
  // URL (/tournaments/[slug], shared with PLAYER), never under /admin/.
  function handleCreateSuccess(tournament: Tournament | undefined) {
    setCreating(false);
    if (tournament) {
      router.push(`/${clubSlug}/tournaments/${tournament.slug}?created=1`);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Torneos</h1>
          <p className="text-brand-muted mt-1 text-sm">
            Administra inscripciones, duplas y clasificación de tus torneos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Crear torneo
        </button>
      </div>

      {tournaments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Trophy className="w-6 h-6 text-brand-muted" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">Aún no hay torneos</h3>
          <p className="text-sm text-brand-muted max-w-sm mb-6">
            Crea el primer torneo del club para administrar inscripciones, duplas y clasificación.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Crear torneo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              href={`/${clubSlug}/tournaments/${t.slug}`}
              confirmedCount={confirmedCountByTournamentId?.[t.id] ?? 0}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateTournamentModal
          clubSlug={clubSlug}
          clubId={clubId}
          categories={categories}
          onClose={() => setCreating(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </>
  );
}
