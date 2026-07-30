import Link from "next/link";
import type { ComponentType } from "react";
import { Building2, CheckCircle2, XCircle, Users, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

function StatTile({
  label,
  value,
  Icon,
  color,
  href,
}: {
  label: string;
  value: number;
  Icon: ComponentType<{ className?: string }>;
  color: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color, opacity: 0.8 }} />
      <Icon className="absolute right-4 bottom-4 w-14 h-14 text-white opacity-[0.04]" />
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs text-brand-muted mb-1 leading-tight">{label}</p>
      <p className="text-3xl font-bold tabular-nums leading-none" style={{ color }}>
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="relative bg-brand-surface border border-white/10 rounded-2xl p-5 overflow-hidden hover:border-white/25 transition-colors block"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="relative bg-brand-surface border border-white/10 rounded-2xl p-5 overflow-hidden">
      {content}
    </div>
  );
}

function QuickAccessCard({
  title,
  description,
  href,
  Icon,
  color,
}: {
  title: string;
  description: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Link
      href={href}
      style={{ "--qa-color": color } as React.CSSProperties}
      className="flex items-center gap-4 p-5 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--qa-color)] hover:bg-[color-mix(in_srgb,var(--qa-color)_6%,transparent)] transition-colors group"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-brand-muted mt-0.5">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-brand-muted group-hover:text-white transition-colors shrink-0" />
    </Link>
  );
}

export default async function PlatformDashboardPage() {
  const supabase = await createClient();

  // get_platform_clubs_overview is a SECURITY DEFINER RPC gated on
  // profiles.is_platform_admin inside its own body (see migrations
  // 20260723000001 / 20260724000001) — the only way to see inactive
  // clubs and cross-club counts without touching existing RLS.
  const [overviewResult, usersCountResult] = await Promise.all([
    supabase.rpc("get_platform_clubs_overview"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const clubs = overviewResult.data ?? [];
  const totalUsers = usersCountResult.count ?? 0;

  const totalClubs = clubs.length;
  const activeClubs = clubs.filter((c) => c.is_active).length;
  const inactiveClubs = totalClubs - activeClubs;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Administración de la plataforma</h1>
      <p className="text-sm text-brand-muted mb-8">
        Métricas globales y accesos rápidos de MiPadelClub.
      </p>

      {overviewResult.error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudieron cargar los datos globales ({overviewResult.error.message}).
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatTile label="Total de clubes" value={totalClubs} Icon={Building2} color="#00ffff" href="/platform/clubs" />
        <StatTile label="Clubes activos" value={activeClubs} Icon={CheckCircle2} color="#22C55E" />
        <StatTile label="Clubes inactivos" value={inactiveClubs} Icon={XCircle} color="#EF4444" />
        <StatTile label="Usuarios registrados" value={totalUsers} Icon={Users} color="#037172" href="/platform/users" />
      </div>

      <h2 className="text-sm font-semibold text-white mb-4">Accesos rápidos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuickAccessCard
          title="Clubes"
          description="Buscar y consultar todos los clubes de la plataforma."
          href="/platform/clubs"
          Icon={Building2}
          color="#00ffff"
        />
        <QuickAccessCard
          title="Usuarios"
          description="Buscar y consultar todos los usuarios registrados."
          href="/platform/users"
          Icon={Users}
          color="#037172"
        />
      </div>
    </div>
  );
}
