"use client";

import { useState } from "react";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { PlayerCategoryBadge } from "@/components/players/PlayerCategoryBadge";
import { FilterDropdown } from "@/components/ui";
import { MemberModal } from "./MemberModal";
import { Users, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PLAYER_CATEGORIES, type PlayerCategory, type SportCategory } from "@/types/database";

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
}

type StatusFilter = "all" | "active" | "inactive";
type CategoryFilter = "all" | PlayerCategory;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
];

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  ...PLAYER_CATEGORIES.map((c) => ({ value: c, label: c })),
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MembersClient({ members, clubSlug, clubId, sportCategories }: MembersClientProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  const filtered = members
    .filter((m) => {
      if (statusFilter === "active") return m.is_active;
      if (statusFilter === "inactive") return !m.is_active;
      return true;
    })
    .filter((m) => {
      if (categoryFilter === "all") return true;
      return (m.category ?? "Principiante") === categoryFilter;
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
          <FilterDropdown
            label="Categoría"
            value={categoryFilter}
            defaultValue="all"
            options={CATEGORY_OPTIONS}
            onChange={setCategoryFilter}
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

            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedMember(member)}
                className="flex flex-col items-center text-center gap-1 p-5 rounded-2xl bg-brand-surface border border-white/10 hover:border-brand-primary/25 hover:bg-brand-primary/5 transition-colors"
              >
                <PlayerAvatar
                  player={{ id: member.profile_id, ...member.profiles }}
                  size="2xl"
                  className="mb-3"
                />

                <p className="text-sm font-semibold text-white truncate w-full">{name}</p>

                <PlayerCategoryBadge category={member.category} size="sm" className="mt-1" />

                <p className="text-[11px] text-brand-muted/60 mt-2">
                  Partidos: <span className="text-white/70 font-medium">—</span>
                  <span className="mx-1.5 text-brand-muted/30">·</span>
                  Ranking: <span className="text-white/70 font-medium">—</span>
                </p>

                <p className={cn("text-xs mt-1", member.is_active ? "text-emerald-400" : "text-brand-muted/70")}>
                  {member.is_active ? "Activo" : "Inactivo"}
                </p>

                <p className="text-[11px] text-brand-muted/60 mt-3">Miembro desde</p>
                <p className="text-xs text-white/80">{formatDate(member.joined_at)}</p>
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
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
