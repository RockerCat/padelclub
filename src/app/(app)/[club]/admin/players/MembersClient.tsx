"use client";

import { useState } from "react";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import { FilterDropdown } from "@/components/ui";
import { MemberModal } from "./MemberModal";
import { Users, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PlayerCategory, SportCategory } from "@/types/database";

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
  sportStateByMember: Record<string, { category: string; position: number }>;
  // "Partidos" — resuelto una sola vez para todo el club en page.tsx
  // (getClubMatchesPlayedByMember), nunca por jugador. Cuenta reservas
  // type='match' confirmadas y ya finalizadas (ver Sport / Ranking Module
  // Principles — una reservation ordinaria nunca tiene resultado oficial),
  // clave por profile_id. null = la consulta en sí falló (muestra "—"); un
  // profile_id ausente del mapa (pero el mapa no es null) significa cero
  // partidos, nunca "—".
  matchesPlayedByMember: Record<string, number> | null;
}

type StatusFilter = "all" | "active" | "inactive";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
];

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
}: MembersClientProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  const filtered = members
    .filter((m) => {
      if (statusFilter === "active") return m.is_active;
      if (statusFilter === "inactive") return !m.is_active;
      return true;
    })
    .filter((m) => {
      if (!search.trim()) return true;
      return m.profiles?.full_name?.toLowerCase().includes(search.toLowerCase().trim());
    });

  return (
    <div>
      {/* Search + filters — stacked on mobile, one row on desktop when it fits */}
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
            defaultValue="all"
            options={STATUS_OPTIONS}
            onChange={setStatusFilter}
          />
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-brand-muted" />
          </div>
          <p className="text-sm font-medium text-white mb-1">
            {search ? "Sin resultados" : "No hay miembros en esta categoría"}
          </p>
          <p className="text-xs text-brand-muted">
            {search ? `Ningún miembro coincide con "${search}"` : "Prueba un filtro diferente."}
          </p>
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
