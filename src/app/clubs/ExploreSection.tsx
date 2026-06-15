"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { getClubEntryPath } from "@/lib/utils/navigation";

export type DirectoryClub = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  description: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  whatsapp: string | null;
};

export type MemberInfo = {
  slug: string;
  role: string;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ClubDirectoryCard({
  club,
  memberInfo,
}: {
  club: DirectoryClub;
  memberInfo?: MemberInfo;
}) {
  const initials = getInitials(club.name);
  const isMember = !!memberInfo;
  const location = [club.city, club.state].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-brand-surface border border-white/10 hover:border-white/20 transition-colors">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
          style={{
            backgroundColor: `${club.primary_color}22`,
            color: club.primary_color,
          }}
        >
          {club.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={club.logo_url}
              alt={`Logo de ${club.name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white">{club.name}</p>
            {isMember && (
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
                style={{
                  color: club.primary_color,
                  backgroundColor: `${club.primary_color}18`,
                  borderColor: `${club.primary_color}40`,
                }}
              >
                Miembro
              </span>
            )}
          </div>
          {location && (
            <p className="text-xs text-brand-muted mt-0.5">{location}</p>
          )}
          {club.description && (
            <p className="text-xs text-brand-muted/70 mt-1.5 line-clamp-2">
              {club.description}
            </p>
          )}
        </div>
      </div>

      {/* CTA */}
      {isMember ? (
        <Link
          href={getClubEntryPath(memberInfo.slug, memberInfo.role)}
          className="flex items-center justify-center py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{
            backgroundColor: `${club.primary_color}22`,
            color: club.primary_color,
            border: `1px solid ${club.primary_color}44`,
          }}
        >
          Entrar →
        </Link>
      ) : (
        <Link
          href={`/clubs/${club.slug}`}
          className="flex items-center justify-center py-2 rounded-xl text-sm font-medium border border-white/15 text-white hover:border-white/30 hover:bg-white/5 transition-colors"
        >
          Ver club →
        </Link>
      )}
    </div>
  );
}

interface ExploreSectionProps {
  clubs: DirectoryClub[];
  memberMap: Record<string, MemberInfo>;
  isAuthenticated: boolean;
}

export function ExploreSection({ clubs, memberMap, isAuthenticated }: ExploreSectionProps) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clubs.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          (c.city ?? "").toLowerCase().includes(q) ||
          (c.state ?? "").toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q)
      )
    : clubs;

  return (
    <section>
      <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
        Explorar clubes
      </h2>

      {/* Search */}
      {clubs.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted/60 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, ciudad o departamento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-brand-surface border border-white/10 text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>
      )}

      {/* Results */}
      {clubs.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-brand-muted">No hay clubes públicos disponibles aún.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-brand-muted">
            No se encontraron clubes con &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((club) => (
            <ClubDirectoryCard
              key={club.id}
              club={club}
              memberInfo={memberMap[club.id]}
            />
          ))}
        </div>
      )}

      {/* Auth CTA for anonymous visitors */}
      {!isAuthenticated && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 py-5 px-5 rounded-2xl bg-brand-surface border border-white/10">
          <div>
            <p className="text-sm font-medium text-white">¿Ya tienes una cuenta?</p>
            <p className="text-xs text-brand-muted mt-0.5">
              Inicia sesión para ver tus clubes y solicitar acceso.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/auth/login"
              className="px-4 py-2 rounded-xl text-sm font-medium border border-white/20 text-white hover:border-white/40 transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/auth/signup"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
            >
              Registrarse
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
