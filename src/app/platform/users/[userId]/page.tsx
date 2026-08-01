import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { UserActionsPanel } from "./UserActionsPanel";
import type { PlatformUserMembership } from "../PlatformUsersTable";

interface PageProps {
  params: Promise<{ userId: string }>;
}

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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PlatformUserDetailPage({ params }: PageProps) {
  const { userId } = await params;
  const supabase = await createClient();

  const [{ data: rows, error }, { data: currentUser }] = await Promise.all([
    supabase.rpc("get_platform_user_detail", { p_user_id: userId }),
    supabase.auth.getUser(),
  ]);

  const user = rows?.[0];

  if (!user && !error) notFound();

  // get_platform_user_detail's `memberships` column is jsonb — Postgres
  // has no static element type for it, so the generated Args type is
  // (correctly) `Json`. The RPC's own SQL always builds it as
  // jsonb_agg(jsonb_build_object('club_name', ..., 'club_slug', ...,
  // 'role', ...)), defaulting to '[]'::jsonb — never null — so this is
  // the one real shape it can ever have.
  const memberships = (user?.memberships ?? []) as unknown as PlatformUserMembership[];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      <Link
        href="/platform/users"
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Usuarios
      </Link>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudo cargar el usuario ({error.message}).
        </div>
      )}

      {user && (
        <>
          {/* ── Información general ─────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <h1 className="text-xl font-bold text-white">{user.full_name ?? "Sin nombre"}</h1>
            <p className="text-sm text-brand-muted">{user.email ?? "—"}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge variant={user.is_platform_admin ? "primary" : "outline"} size="sm">
                {user.is_platform_admin ? "Platform Admin" : "Usuario"}
              </Badge>
              <Badge variant={user.is_banned ? "danger" : "success"} size="sm">
                {user.is_banned ? "Suspendido" : "Activo"}
              </Badge>
            </div>
          </div>

          {/* ── Información adicional ───────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
              Información adicional
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-brand-muted">Fecha de registro</dt>
                <dd className="text-white">{formatDate(user.created_at)}</dd>
              </div>
              <div>
                <dt className="text-brand-muted">Último inicio de sesión</dt>
                <dd className="text-white">
                  {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "Nunca"}
                </dd>
              </div>
            </dl>
          </div>

          {/* ── Clubes y roles ───────────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
              Clubes y roles
            </h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-brand-muted">No pertenece a ningún club.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {memberships.map((m) => (
                  <li
                    key={`${m.club_slug}-${m.role}`}
                    className="flex items-center justify-between text-sm px-3 py-2 rounded-xl bg-white/5 border border-white/10"
                  >
                    <span className="text-white">{m.club_name}</span>
                    <span className="text-brand-muted">{ROLE_LABELS[m.role] ?? m.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Acciones ─────────────────────────────────────────────── */}
          <UserActionsPanel
            userId={user.id}
            initialName={user.full_name ?? ""}
            initialEmail={user.email ?? ""}
            initialBanned={user.is_banned}
            isSelf={user.id === currentUser.user?.id}
          />
        </>
      )}
    </div>
  );
}
