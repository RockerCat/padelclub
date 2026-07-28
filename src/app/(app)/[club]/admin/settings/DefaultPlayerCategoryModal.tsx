"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsModuleModal } from "./SettingsModuleModal";
import { Button } from "@/components/ui";
import { configureDefaultPlayerCategory, type ConfigureDefaultCategoryState } from "./actions";
import type { SportCategory } from "@/types/database";

interface DefaultPlayerCategoryModalProps {
  clubId: string;
  clubSlug: string;
  currentCategory: string | null;
  categories: SportCategory[];
  onClose: () => void;
}

// Fase 1 módulo deportivo — configura únicamente clubs.default_player_category
// y dispara el aprovisionamiento de jugadores sin estado (todo vía
// configure_club_default_player_category, SECURITY DEFINER). No muestra
// puntos, ranking, ciclos, historial, promociones ni descensos — esta
// pantalla solo existe para fijar la categoría inicial del club.
export function DefaultPlayerCategoryModal({
  clubId,
  clubSlug,
  currentCategory,
  categories,
  onClose,
}: DefaultPlayerCategoryModalProps) {
  const router = useRouter();
  const boundAction = configureDefaultPlayerCategory.bind(null, clubId, clubSlug);
  const [state, action, pending] = useActionState<ConfigureDefaultCategoryState, FormData>(
    boundAction,
    {}
  );
  const [selected, setSelected] = useState(currentCategory ?? "");

  // Same convention as AllowedDurationsForm/OperationModal: a successful
  // save refreshes the Server Component so the card behind the modal shows
  // the new saved value without a full reload.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <SettingsModuleModal title="Categoría inicial de jugadores" onClose={onClose}>
      <form action={action} className="flex flex-col gap-4">
        <p className="text-sm text-brand-muted">
          Esta categoría se asignará a los jugadores que aún no tengan estado deportivo.
          Cambiarla no moverá jugadores ya categorizados.
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="default-player-category-select" className="text-xs font-medium text-brand-muted">
            Categoría
          </label>
          <select
            id="default-player-category-select"
            name="category"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          >
            <option value="" disabled className="bg-[#001A24]">
              Selecciona una categoría
            </option>
            {categories.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#001A24]">
                {c.code}
              </option>
            ))}
          </select>
        </div>

        {state.error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {state.error}
          </p>
        )}

        {state.success && (
          <p className="text-sm text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-xl px-4 py-3">
            Categoría guardada.
            {typeof state.provisionedCount === "number" && state.provisionedCount > 0
              ? ` ${state.provisionedCount} jugador${state.provisionedCount === 1 ? "" : "es"} ${
                  state.provisionedCount === 1 ? "fue aprovisionado" : "fueron aprovisionados"
                }.`
              : ""}
          </p>
        )}

        <div className="pt-1 flex justify-end">
          <Button type="submit" disabled={!selected} loading={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </SettingsModuleModal>
  );
}
