"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Building2 } from "lucide-react";
import { Badge } from "@/components/ui";

export type PlatformClubRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  visibility: string;
  is_active: boolean;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  player_count: number;
  court_count: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function PlatformClubsTable({ clubs }: { clubs: PlatformClubRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = clubs.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.owner_email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
        <input
          type="text"
          placeholder="Buscar por nombre, slug o correo del owner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-brand-surface border border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Building2 className="w-5 h-5 text-brand-muted" />
          </div>
          <p className="text-sm font-medium text-white mb-1">Sin resultados</p>
          <p className="text-xs text-brand-muted">
            Ningún club coincide con &quot;{search}&quot;
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-brand-muted uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Club</th>
                <th className="px-4 py-3 font-medium">Visibilidad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Creado</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium text-right">Jugadores</th>
                <th className="px-4 py-3 font-medium text-right">Canchas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((club) => (
                <tr
                  key={club.id}
                  onClick={() => router.push(`/platform/clubs/${club.id}`)}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 overflow-hidden bg-white/5 text-brand-muted"
                      >
                        {club.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={club.logo_url}
                            alt={`Logo de ${club.name}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          getInitials(club.name)
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/platform/clubs/${club.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-white font-medium whitespace-nowrap hover:underline"
                        >
                          {club.name}
                        </Link>
                        <p className="text-xs text-brand-muted">/{club.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={club.visibility === "public" ? "outline" : "secondary"} size="sm">
                      {club.visibility === "public" ? "Pública" : "Privada"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={club.is_active ? "success" : "danger"} size="sm">
                      {club.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                    {formatDate(club.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white whitespace-nowrap">{club.owner_name ?? "—"}</p>
                    <p className="text-xs text-brand-muted">{club.owner_email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white">
                    {club.player_count}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white">
                    {club.court_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
