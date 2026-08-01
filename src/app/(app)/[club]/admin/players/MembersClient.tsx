"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { FilterDropdown } from "@/components/ui";
import { MemberModal } from "./MemberModal";
import { Users, Search, ChevronRight } from "lucide-react";
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

// Fase 1 módulo deportivo — categoría + posición vigentes, ya resueltas en
// el servidor. `points` se agregó únicamente para la fila compacta de
// mobile (ver CompactMemberRow) — es el mismo `current_points` que
// get_club_category_ranking_view/get_club_member_sport_state ya devolvían
// y que antes se descartaba al construir este mapa; nunca una consulta
// nueva.
export type MemberSportState = { category: string; position: number | null; points: number | null };

interface MembersClientProps {
  members: MemberRow[];
  clubSlug: string;
  clubId: string;
  sportCategories: SportCategory[];
  sportStateByMember: Record<string, MemberSportState>;
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

// La tarjeta grande — exclusiva de desktop/tablet (ver MembersClient más
// abajo). Mobile ya no la usa en absoluto: se probó como "Top 3" destacado
// y se retiró por ocupar demasiado espacio sin aportar valor — /[club]/ranking
// ya cumple ese objetivo. Queda como la única implementación de "la tarjeta
// del jugador", usada solo en la grilla desktop.
function MemberCard({
  member,
  sportState,
  matchesPlayed,
  onSelect,
}: {
  member: MemberRow;
  sportState: MemberSportState | undefined;
  matchesPlayed: number | null;
  onSelect: () => void;
}) {
  const name = member.profiles?.full_name ?? "Sin nombre";

  return (
    <button
      type="button"
      onClick={onSelect}
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
}

// Fila compacta — únicamente mobile ("Todos los jugadores"). Reutiliza el
// mismo PlayerSportAvatar (avatar + corona + categoría) y el mismo estado
// Activo/Inactivo que la tarjeta grande, solo que en una sola línea visual
// para poder recorrer muchos más jugadores por pantalla. Abre exactamente
// el mismo modal (onSelect, provisto por el caller) — nunca una segunda
// implementación del detalle del jugador.
function CompactMemberRow({
  member,
  sportState,
  onSelect,
}: {
  member: MemberRow;
  sportState: MemberSportState | undefined;
  onSelect: () => void;
}) {
  const name = member.profiles?.full_name ?? "Sin nombre";
  const position = sportState?.position ?? null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 active:bg-white/[0.07] transition-colors text-left"
    >
      <PlayerSportAvatar
        player={{ id: member.profile_id, ...member.profiles }}
        size="sm"
        sportCategory={sportState?.category ?? null}
        rankingPosition={position}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        <p className="text-xs text-brand-muted/70 truncate">
          {sportState?.category ?? "—"}
          <span className="mx-1 text-brand-muted/30">•</span>
          {position !== null ? `#${position}` : "—"}
          <span className="mx-1 text-brand-muted/30">•</span>
          {sportState?.points ?? 0} pts
        </p>
      </div>

      <span
        className={cn(
          "text-xs font-medium shrink-0",
          member.is_active ? "text-emerald-400" : "text-brand-muted/70"
        )}
      >
        {member.is_active ? "Activo" : "Inactivo"}
      </span>
      <ChevronRight className="w-4 h-4 text-brand-muted/40 shrink-0" />
    </button>
  );
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

  function getMatchesPlayed(member: MemberRow): number | null {
    return matchesPlayedByMember === null ? null : (matchesPlayedByMember[member.profile_id] ?? 0);
  }

  return (
    <div>
      {/* Search + filters — search takes a full row on mobile, filters sit
          below it side by side; on desktop all three share one row, search
          taking the remaining width. Unchanged for every role/breakpoint. */}
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

      {filtered.length > 0 && (
        <>
          {/* ── Desktop/tablet: exactamente la grilla de tarjetas de siempre,
              sin ningún cambio — oculta en mobile, donde el listado
              compacto de abajo la reemplaza. ── */}
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                sportState={sportStateByMember[member.id]}
                matchesPlayed={getMatchesPlayed(member)}
                onSelect={() => setSelectedMember(member)}
              />
            ))}
          </div>

          {/* ── Mobile only: listado compacto, directamente debajo de los
              filtros — sin Top 3, sin cards grandes, sin encabezado de
              sección intermedio. /[club]/ranking ya es la pantalla que
              destaca a los mejores jugadores; esta pantalla es únicamente
              para encontrar a alguien rápido. ── */}
          <div className="md:hidden flex flex-col divide-y divide-white/5">
            {filtered.map((member) => (
              <CompactMemberRow
                key={member.id}
                member={member}
                sportState={sportStateByMember[member.id]}
                onSelect={() => setSelectedMember(member)}
              />
            ))}
          </div>
        </>
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
