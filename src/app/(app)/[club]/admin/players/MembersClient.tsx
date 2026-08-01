"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { FilterDropdown } from "@/components/ui";
import { MemberModal } from "./MemberModal";
import { Users, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PlayerCategory, SportCategory } from "@/types/database";
import { PLAYERS_STATUS_OPTIONS, PLAYERS_CATEGORY_ALL, type PlayersStatusFilter } from "./playersFiltersConfig";

export type MemberRow = {
  id: string;
  club_id: string;
  profile_id: string;
  role: "OWNER" | "ADMIN" | "PLAYER";
  is_active: boolean;
  joined_at: string;
  category: PlayerCategory;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
};

interface MembersClientProps {
  members: MemberRow[];
  clubSlug: string;
  clubId: string;
  sportCategories: SportCategory[];
  // Fase 1 módulo deportivo — categoría deportiva vigente + posición en el
  // ranking de su categoría, ya resueltas en el servidor (page.tsx) vía el
  // mismo RPC get_club_category_ranking_view que usa /[club]/ranking. Nunca
  // se recalcula el ranking ni se consulta nada nuevo aquí — solo lectura.
  // position es null para un miembro inactivo (get_club_member_sport_state,
  // resuelto solo cuando el filtro Estado lo requiere — nunca aparece en el
  // ranking view mismo, que solo lista miembros activos).
  sportStateByMember: Record<string, { category: string; position: number | null }>;
  // "Partidos" — resuelto una sola vez para todo el club en page.tsx
  // (getClubMatchesPlayedByMember), nunca por jugador. Cuenta reservas
  // type='match' confirmadas y ya finalizadas (ver Sport / Ranking Module
  // Principles — una reservation ordinaria nunca tiene resultado oficial),
  // clave por profile_id. null = la consulta en sí falló (muestra "—"); un
  // profile_id ausente del mapa (pero el mapa no es null) significa cero
  // partidos, nunca "—".
  matchesPlayedByMember: Record<string, number> | null;
  // Estado/Categoría — resueltos y aplicados server-side en page.tsx (query
  // filtrada + filtro sobre sportStateByMember respectivamente). `members`
  // que llega aquí YA está filtrado por ambos; este componente solo aplica
  // la búsqueda encima, client-side (arquitectura preexistente, sin cambios).
  statusFilter: PlayersStatusFilter;
  categoryFilter: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MembersClient({
  members,
  clubSlug,
  clubId,
  sportCategories,
  sportStateByMember,
  matchesPlayedByMember,
  statusFilter,
  categoryFilter,
}: MembersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  const categoryOptions = [
    { value: PLAYERS_CATEGORY_ALL, label: "Todas" },
    ...sportCategories.map((c) => ({ value: c.code, label: c.code })),
  ];

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const trimmedSearch = search.trim().toLowerCase();
  const filtered = trimmedSearch
    ? members.filter((m) => m.profiles?.full_name?.toLowerCase().includes(trimmedSearch))
    : members;

  // Un solo motivo, en orden de especificidad. `members` ya llega filtrado
  // por Estado/Categoría desde el servidor — si YA viene vacío, el motivo
  // es uno de esos dos filtros (categoría, al ser la elección más
  // deliberada de las dos, gana si ambos aplican); si solo queda vacío
  // DESPUÉS de aplicar la búsqueda local, el motivo es la búsqueda.
  const emptyReason: "category" | "activeStatus" | "search" | "generic" | null =
    filtered.length > 0
      ? null
      : members.length === 0
      ? categoryFilter !== PLAYERS_CATEGORY_ALL
        ? "category"
        : statusFilter === "active"
        ? "activeStatus"
        : "generic"
      : "search";

  return (
    <div>
      {/* Search + filters — search takes a full row on mobile, filters sit
          below it side by side; on desktop all three share one row, search
          taking the remaining width. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-base md:text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterDropdown
            label="Estado"
            value={statusFilter}
            defaultValue="active"
            options={PLAYERS_STATUS_OPTIONS}
            onChange={(value) => updateParam("status", value)}
          />
          <FilterDropdown
            label="Categoría"
            value={categoryFilter}
            defaultValue={PLAYERS_CATEGORY_ALL}
            options={categoryOptions}
            onChange={(value) => updateParam("category", value)}
          />
        </div>
      </div>

      {/* Empty state — el mensaje más específico disponible según qué dejó
          la lista en cero. */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-brand-muted" />
          </div>
          {emptyReason === "category" ? (
            <>
              <p className="text-sm font-medium text-white mb-1">No hay jugadores en esta categoría</p>
              <p className="text-xs text-brand-muted">Selecciona otra categoría o consulta todas.</p>
            </>
          ) : emptyReason === "activeStatus" ? (
            <>
              <p className="text-sm font-medium text-white mb-1">No hay jugadores activos</p>
              <p className="text-xs text-brand-muted">
                Puedes consultar los jugadores inactivos cambiando el filtro de estado.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-white mb-1">No encontramos jugadores</p>
              <p className="text-xs text-brand-muted">Ajusta la búsqueda o los filtros para ver otros jugadores.</p>
            </>
          )}
        </div>
      )}

      {/* Members gallery — club membership cards, not an admin list */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((member) => {
            const name = member.profiles?.full_name ?? "Sin nombre";
            const sportState = sportStateByMember[member.id];
            const matchesPlayed = matchesPlayedByMember === null ? null : (matchesPlayedByMember[member.profile_id] ?? 0);

            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedMember(member)}
                className="flex flex-col items-center text-center gap-2 p-4 rounded-2xl bg-brand-surface border border-white/10 hover:border-brand-primary/25 hover:bg-brand-primary/5 transition-colors"
              >
                <PlayerSportAvatar
                  player={{ id: member.profile_id, ...member.profiles }}
                  size="2xl"
                  sportCategory={sportState?.category ?? null}
                  rankingPosition={sportState?.position ?? null}
                />

                <p className="text-sm font-semibold text-white truncate w-full">{name}</p>

                <p className="text-[11px] text-brand-muted/60">
                  Partidos: <span className="text-white/70 font-medium">{matchesPlayed ?? "—"}</span>
                  <span className="mx-1.5 text-brand-muted/30">·</span>
                  Ranking: <span className="text-white/70 font-medium">{sportState?.position ?? "—"}</span>
                </p>

                <p className="text-xs">
                  <span className={cn("font-medium", member.is_active ? "text-emerald-400" : "text-brand-muted/70")}>
                    {member.is_active ? "Activo" : "Inactivo"}
                  </span>
                  <span className="mx-1.5 text-brand-muted/30">·</span>
                  <span className="text-brand-muted/60">Desde {formatDate(member.joined_at)}</span>
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selectedMember && (
        <MemberModal
          member={selectedMember}
          clubId={clubId}
          clubSlug={clubSlug}
          sportCategories={sportCategories}
          rankingPosition={sportStateByMember[selectedMember.id]?.position ?? null}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
