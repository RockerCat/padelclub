"use client";

import { useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { cn } from "@/lib/utils/cn";
import type { PlayerComboboxCandidate } from "./PlayerCombobox";

interface PlayerTransferListProps {
  // Ya filtrados por el padre (RegisterEntryModal): elegibilidad,
  // excludeIds y regla de composición H+L — este componente nunca decide
  // quién es válido, solo presenta y transfiere entre los dos paneles.
  availableCandidates: PlayerComboboxCandidate[];
  // Orden = orden de selección (el primero elegido es "Jugador 1"), nunca
  // reordenado por este componente.
  selectedPlayers: PlayerComboboxCandidate[];
  onSelect: (clubMemberId: string) => void;
  onDeselect: (clubMemberId: string) => void;
  // Ids de selectedPlayers que no pueden quitarse — nunca reciben botón
  // "-" ni responden a clic, se renderizan como integrante fijo (modo
  // autoinscripción de PLAYER: el propio jugador). Vacío/omitido = todos
  // los seleccionados son removibles (comportamiento admin, sin cambios).
  lockedPlayerIds?: string[];
  // Sufijo mostrado junto al nombre de una fila bloqueada, ej. "(Tú)".
  lockedPlayerLabel?: string;
  // Título del panel derecho — "Dupla seleccionada" (admin) o "Tu dupla"
  // (jugador).
  panelTitle?: string;
  // Texto bajo la única fila cuando hay exactamente 1 seleccionado y aún
  // falta el segundo — solo tiene sentido en el modo autoinscripción
  // (1 fijo + falta el partner); si se omite, ese caso no muestra nada
  // extra (comportamiento admin sin cambios).
  partnerHintText?: string;
  // Texto del estado totalmente vacío (0 seleccionados) — solo alcanzable
  // en modo admin, ya que el modo autoinscripción siempre arranca con 1.
  emptyStateText?: string;
}

const MAX_SELECTED = 2;
const LEFT_LIST_HEIGHT = 320;
// Compensa la ausencia de buscador en el panel derecho (input h-10 + gap
// 6px) para que ambos paneles terminen con una altura total similar.
const RIGHT_LIST_HEIGHT = LEFT_LIST_HEIGHT + 40 + 6;

// Patrón "lista de transferencia": panel izquierdo (disponibles, con
// buscador) → clic transfiere al panel derecho (dupla, máx. 2, en orden
// de selección) → clic ahí lo devuelve al izquierdo. Sin drag-and-drop,
// toda la interacción es clic/tap. Único componente para construir una
// dupla en todo el módulo — tanto el organizador (ambos jugadores
// libres) como el jugador que se autoinscribe (él mismo fijo en el
// primer lugar) lo reutilizan tal cual, la diferencia es solo de props.
export function PlayerTransferList({
  availableCandidates,
  selectedPlayers,
  onSelect,
  onDeselect,
  lockedPlayerIds = [],
  lockedPlayerLabel = "(Tú)",
  panelTitle = "Dupla seleccionada",
  partnerHintText,
  emptyStateText = "Selecciona 2 jugadores para formar la dupla.",
}: PlayerTransferListProps) {
  const [query, setQuery] = useState("");
  const isFull = selectedPlayers.length >= MAX_SELECTED;

  const filtered = (
    query.trim()
      ? availableCandidates.filter((c) => (c.full_name ?? "").toLowerCase().includes(query.trim().toLowerCase()))
      : availableCandidates
  )
    .slice()
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "es"));

  return (
    <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
      {/* Panel izquierdo: jugadores disponibles */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <label className="text-sm font-medium text-white/80">Jugadores disponibles</label>

        <div className="relative">
          <Search className="w-4 h-4 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jugador..."
            className="w-full h-10 rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
          />
        </div>

        <div
          className="flex flex-col gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-1.5"
          style={{ height: LEFT_LIST_HEIGHT }}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-brand-muted">
              {query.trim() ? "No hay jugadores que coincidan con tu búsqueda." : "Sin jugadores disponibles."}
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.club_member_id}
                type="button"
                disabled={isFull}
                aria-label={`Agregar a ${c.full_name ?? "jugador"} a la dupla`}
                onClick={() => onSelect(c.club_member_id)}
                className={cn(
                  "w-full flex items-center gap-2.5 h-12 px-3 rounded-lg border border-transparent transition-colors text-left shrink-0",
                  isFull ? "opacity-40 cursor-not-allowed" : "hover:bg-white/5 hover:border-white/10"
                )}
              >
                <PlayerSportAvatar
                  player={{ id: c.club_member_id, full_name: c.full_name, avatar_url: c.avatar_url }}
                  size="sm"
                  sportCategory={c.category}
                />
                <span className="text-sm text-white truncate min-w-0 flex-1">{c.full_name ?? "Jugador"}</span>
                <span className="text-xs text-brand-muted shrink-0 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                  {c.category}
                </span>
                <Plus className="w-4 h-4 text-brand-muted shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Panel derecho: dupla — bloque final, no otro buscador */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-white/80">{panelTitle}</label>
          {isFull && (
            <span className="text-[10px] font-medium text-brand-primary bg-brand-primary/10 border border-brand-primary/30 rounded-full px-2 py-0.5 shrink-0">
              Completa
            </span>
          )}
        </div>

        <div
          className="flex flex-col gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-1.5"
          style={{ height: RIGHT_LIST_HEIGHT }}
        >
          {selectedPlayers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-4 text-center">
              <p className="text-xs text-brand-muted">{emptyStateText}</p>
            </div>
          ) : (
            <>
              {selectedPlayers.map((c) => {
                const isLocked = lockedPlayerIds.includes(c.club_member_id);
                if (isLocked) {
                  return (
                    <div
                      key={c.club_member_id}
                      className="w-full flex items-center gap-2.5 h-12 px-3 rounded-lg border border-brand-primary bg-brand-primary/10 shrink-0"
                    >
                      <PlayerSportAvatar
                        player={{ id: c.club_member_id, full_name: c.full_name, avatar_url: c.avatar_url }}
                        size="sm"
                        sportCategory={c.category}
                      />
                      <span className="text-sm text-white truncate min-w-0 flex-1">
                        {c.full_name ?? "Jugador"} {lockedPlayerLabel}
                      </span>
                      <span className="text-xs text-brand-muted shrink-0 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                        {c.category}
                      </span>
                    </div>
                  );
                }
                return (
                  <button
                    key={c.club_member_id}
                    type="button"
                    aria-label={`Quitar a ${c.full_name ?? "jugador"} de la dupla`}
                    onClick={() => onDeselect(c.club_member_id)}
                    className="w-full flex items-center gap-2.5 h-12 px-3 rounded-lg border border-brand-primary bg-brand-primary/10 transition-colors text-left shrink-0 hover:bg-brand-primary/15"
                  >
                    <PlayerSportAvatar
                      player={{ id: c.club_member_id, full_name: c.full_name, avatar_url: c.avatar_url }}
                      size="sm"
                      sportCategory={c.category}
                    />
                    <span className="text-sm text-white truncate min-w-0 flex-1">{c.full_name ?? "Jugador"}</span>
                    <span className="text-xs text-brand-muted shrink-0 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                      {c.category}
                    </span>
                    <Minus className="w-4 h-4 text-brand-primary shrink-0" />
                  </button>
                );
              })}
              {selectedPlayers.length === 1 && partnerHintText && (
                <div className="w-full flex items-center justify-center h-12 px-3 rounded-lg border border-dashed border-white/15 text-xs text-brand-muted shrink-0 text-center">
                  {partnerHintText}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
