"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui";

export type PlatformUserMembership = {
  club_name: string;
  club_slug: string;
  role: string;
};

export type PlatformUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_platform_admin: boolean;
  created_at: string;
  memberships: PlatformUserMembership[];
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  PLAYER: "Jugador",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PlatformUsersTable({ users }: { users: PlatformUserRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
        <input
          type="text"
          placeholder="Buscar por nombre o correo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-brand-surface border border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-brand-muted" />
          </div>
          <p className="text-sm font-medium text-white mb-1">Sin resultados</p>
          <p className="text-xs text-brand-muted">
            Ningún usuario coincide con &quot;{search}&quot;
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-brand-muted uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Platform Admin</th>
                <th className="px-4 py-3 font-medium">Clubes y roles</th>
                <th className="px-4 py-3 font-medium">Registro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => router.push(`/platform/users/${user.id}`)}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                    {user.full_name ?? "Sin nombre"}
                  </td>
                  <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                    {user.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.is_platform_admin ? "primary" : "outline"} size="sm">
                      {user.is_platform_admin ? "Sí" : "No"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {user.memberships.length === 0 ? (
                      <span className="text-brand-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {user.memberships.map((m) => (
                          <span
                            key={`${m.club_slug}-${m.role}`}
                            className="text-[11px] text-brand-muted bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-md whitespace-nowrap"
                          >
                            {m.club_name} · {ROLE_LABELS[m.role] ?? m.role}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                    {formatDate(user.created_at)}
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
