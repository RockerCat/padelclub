"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trophy } from "lucide-react";
import { TournamentCard } from "./TournamentCard";
import { CreateTournamentModal } from "./CreateTournamentModal";
import {
  type TabKey,
  ADMIN_TAB_ORDER,
  PLAYER_TAB_ORDER,
  tournamentsForTab,
  resolveDefaultTab,
} from "../../../../../../shared/tournaments/tabs";
import { effectivePlayerTournamentStatus } from "../../../../../../shared/tournaments/actions";
import type { Tournament, SportCategory } from "@/types/database";

interface TournamentsGridProps {
  tournaments: Tournament[];
  confirmedCountByTournamentId?: Record<string, number>;
  // Solo se usan cuando role !== "PLAYER" (para CreateTournamentModal) —
  // opcional para que la página de PLAYER pueda reutilizar este mismo
  // componente sin tener que cargar sport_categories, que nunca necesita.
  categories?: Pick<SportCategory, "code" | "sort_order">[];
  clubSlug: string;
  clubId: string;
  // Único prop nuevo para reutilizar el mismo componente en la vista de
  // PLAYER (Bloque de tabs) — decide tanto el juego de tabs visible como
  // si se muestra "Crear torneo" (OWNER/ADMIN-only, sin cambios en esa
  // regla). Ningún otro comportamiento (filtrado, tab por defecto,
  // tarjetas, navegación al detalle) depende del rol: es exactamente la
  // misma lógica para los tres.
  role: "OWNER" | "ADMIN" | "PLAYER";
}

export function TournamentsGrid({
  tournaments,
  confirmedCountByTournamentId,
  categories = [],
  clubSlug,
  clubId,
  role,
}: TournamentsGridProps) {
  const router = useRouter();
  const canCreate = role !== "PLAYER";
  const tabOrder = role === "PLAYER" ? PLAYER_TAB_ORDER : ADMIN_TAB_ORDER;
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveDefaultTab(tournaments, tabOrder));
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
            {canCreate
              ? "Administra inscripciones, duplas y clasificación de tus torneos."
              : "Consulta los torneos del club e inscríbete con tu partner."}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Crear torneo
          </button>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Trophy className="w-6 h-6 text-brand-muted" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">Aún no hay torneos</h3>
          <p className="text-sm text-brand-muted max-w-sm mb-6">
            {canCreate
              ? "Crea el primer torneo del club para administrar inscripciones, duplas y clasificación."
              : "El club todavía no ha publicado torneos."}
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              Crear torneo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Tabs de estado — scroll horizontal en mobile, fila normal en
              desktop. Cada tab filtra el mismo arreglo `tournaments` ya
              cargado por el padre (sin consulta nueva); un torneo cae en
              exactamente un tab (los archivados nunca en los otros seis),
              así que nunca hay duplicados. Mismo componente para los tres
              roles — solo cambia qué tabs incluye `tabOrder`. */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-6" role="tablist">
            {tabOrder.map(({ key, label }) => {
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
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {tournamentsInTab.map((t) => (
                <TournamentCard
                  key={t.id}
                  tournament={t}
                  href={`/${clubSlug}/tournaments/${t.slug}`}
                  confirmedCount={confirmedCountByTournamentId?.[t.id] ?? 0}
                  // PLAYER ve el estado EFECTIVO (un 'registration_open'
                  // cuyo horario real ya cerró se percibe como
                  // 'registration_closed'); OWNER/ADMIN sigue viendo el
                  // status real, sin cambios — mismo criterio que ya
                  // aplica TournamentDetailView.tsx.
                  displayStatus={role === "PLAYER" ? effectivePlayerTournamentStatus(t) : t.status}
                />
              ))}
            </div>
          )}
        </>
      )}

      {canCreate && creating && (
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
