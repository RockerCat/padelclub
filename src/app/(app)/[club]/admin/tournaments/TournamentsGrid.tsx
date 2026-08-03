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

// "archived" is not a real tournaments.status value — it's orthogonal
// (archived_at IS NOT NULL), so it gets its own synthetic tab key here,
// filtered differently below (see tournamentsForTab). Every other key is
// a real status value, always filtered with `!t.archived_at` too, so an
// archived tournament — regardless of its underlying status — can never
// also show up in one of the six status tabs (no duplicates).
type TabKey =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "archived";

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: "draft", label: "Borradores" },
  { key: "registration_open", label: "Inscripciones abiertas" },
  { key: "registration_closed", label: "Inscripciones cerradas" },
  { key: "in_progress", label: "En vivo" },
  { key: "completed", label: "Finalizados" },
  { key: "cancelled", label: "Cancelados" },
  { key: "archived", label: "Archivados" },
];

function tournamentsForTab(tournaments: Tournament[], key: TabKey): Tournament[] {
  return tournaments.filter((t) => (key === "archived" ? !!t.archived_at : t.status === key && !t.archived_at));
}

// En vivo gana siempre que exista al menos un torneo en ese estado; si
// no, el primer tab (en el orden de arriba) que tenga al menos un torneo.
// Con el club totalmente vacío no importa cuál quede activo (no hay nada
// que mostrar), así que cae en el primero por simplicidad.
function resolveDefaultTab(tournaments: Tournament[]): TabKey {
  if (tournamentsForTab(tournaments, "in_progress").length > 0) return "in_progress";
  for (const { key } of TAB_ORDER) {
    if (tournamentsForTab(tournaments, key).length > 0) return key;
  }
  return TAB_ORDER[0].key;
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
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveDefaultTab(tournaments));
  const tournamentsInTab = tournamentsForTab(tournaments, activeTab);

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
        <>
          {/* Tabs de estado — scroll horizontal en mobile, fila normal en
              desktop. Cada tab filtra el mismo arreglo `tournaments` ya
              cargado por el padre (sin consulta nueva); un torneo cae en
              exactamente un tab (los archivados nunca en los otros seis),
              así que nunca hay duplicados. */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-6" role="tablist">
            {TAB_ORDER.map(({ key, label }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(key)}
                  className={`shrink-0 inline-flex items-center h-9 px-3.5 rounded-xl text-sm font-medium border transition-colors ${
                    isActive
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                      : "border-white/10 text-brand-muted hover:text-white hover:border-white/30"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {tournamentsInTab.length === 0 ? (
            <p className="text-sm text-brand-muted py-10 text-center">No hay torneos en este estado.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tournamentsInTab.map((t) => (
                <TournamentCard
                  key={t.id}
                  tournament={t}
                  href={`/${clubSlug}/tournaments/${t.slug}`}
                  confirmedCount={confirmedCountByTournamentId?.[t.id] ?? 0}
                />
              ))}
            </div>
          )}
        </>
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
