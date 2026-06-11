"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { Users, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type MemberRow = {
  id: string;
  club_id: string;
  profile_id: string;
  role: "OWNER" | "ADMIN" | "PLAYER";
  is_active: boolean;
  joined_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
};

interface MembersClientProps {
  members: MemberRow[];
  clubSlug: string;
}

type FilterKey = "all" | "active" | "inactive";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "inactive", label: "Inactivos" },
];

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PLAYER: "Jugador",
};

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MembersClient({ members, clubSlug }: MembersClientProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const filtered = members
    .filter((m) => {
      if (filter === "active") return m.is_active;
      if (filter === "inactive") return !m.is_active;
      return true;
    })
    .filter((m) => {
      if (!search.trim()) return true;
      return m.profiles?.full_name?.toLowerCase().includes(search.toLowerCase().trim());
    });

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 transition-colors"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? members.length
              : members.filter((m) => {
                  if (f.key === "active") return m.is_active;
                  if (f.key === "inactive") return !m.is_active;
                  return true;
                }).length;

          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-brand-primary/15 text-brand-primary border border-brand-primary/30"
                  : "bg-white/5 text-brand-muted border border-white/10 hover:border-white/20 hover:text-white"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "tabular-nums",
                  filter === f.key ? "text-brand-primary/70" : "text-brand-muted/60"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
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

      {/* Members list */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((member) => {
            const name = member.profiles?.full_name ?? "Sin nombre";
            const initials = getInitials(member.profiles?.full_name ?? null);

            return (
              <Link
                key={member.id}
                href={`/${clubSlug}/admin/players/${member.id}`}
                className="flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-brand-surface border border-white/10 hover:border-brand-primary/25 hover:bg-brand-primary/5 transition-colors group"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-brand-primary">{initials}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{name}</span>
                    <Badge
                      variant={
                        member.role === "OWNER"
                          ? "primary"
                          : member.role === "ADMIN"
                          ? "secondary"
                          : "outline"
                      }
                      size="sm"
                    >
                      {ROLE_LABELS[member.role]}
                    </Badge>
                    {!member.is_active && (
                      <Badge variant="default" size="sm">
                        Inactivo
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-brand-muted mt-0.5">
                    {member.profiles?.phone
                      ? `${member.profiles.phone} · `
                      : ""}
                    Desde {formatDate(member.joined_at)}
                  </p>
                </div>

                {/* Chevron */}
                <svg
                  className="w-4 h-4 text-brand-muted shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
