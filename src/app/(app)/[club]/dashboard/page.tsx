import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Users, TrendingUp, Home, Settings, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface DashboardPageProps {
  params: Promise<{ club: string }>;
}

type MetricItem = {
  label: string;
  value: string;
  empty: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "secondary";
};

type QuickActionItem = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  href: string | null;
  color: string;
  disabled: boolean;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!club) notFound();

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(membership.role)) redirect(`/${slug}`);

  const [courtResult, memberResult] = await Promise.all([
    supabase
      .from("courts")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("is_active", true),
    supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("is_active", true),
  ]);

  const courtCount = courtResult.count ?? 0;
  const memberCount = memberResult.count ?? 0;

  const metrics: MetricItem[] = [
    {
      label: "Reservas del mes",
      value: "—",
      empty: "Sin reservas aún",
      Icon: CalendarDays,
      accent: "primary",
    },
    {
      label: "Jugadores activos",
      value: String(memberCount),
      empty: "Sin jugadores aún",
      Icon: Users,
      accent: "secondary",
    },
    {
      label: "Ocupación promedio",
      value: "—",
      empty: "Sin datos aún",
      Icon: TrendingUp,
      accent: "primary",
    },
  ];

  const quickActions: QuickActionItem[] = [
    {
      label: "Canchas",
      Icon: Home,
      href: `/${slug}/admin/courts`,
      color: "var(--club-primary)",
      disabled: false,
    },
    {
      label: "Jugadores",
      Icon: Users,
      href: `/${slug}/admin/players`,
      color: "var(--club-secondary)",
      disabled: false,
    },
    {
      label: "Configuración",
      Icon: Settings,
      href: `/${slug}/admin`,
      color: "var(--club-primary)",
      disabled: false,
    },
    {
      label: "Reservaciones",
      Icon: CalendarDays,
      href: null,
      color: "var(--club-secondary)",
      disabled: true,
    },
  ];

  return (
    <div className="p-6 md:p-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-surface border border-white/10 p-6 mb-8">
        {/* Subtle dual-color gradient wash */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--club-primary) 8%, transparent), color-mix(in srgb, var(--club-secondary) 8%, transparent))",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{
            background:
              "linear-gradient(to right, var(--club-primary), var(--club-secondary))",
          }}
        />
        <p className="text-sm text-brand-muted mb-0.5">Bienvenido a</p>
        <h1 className="text-2xl font-bold text-white mb-5">{club.name}</h1>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-baseline gap-2">
            <span
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--club-primary)" }}
            >
              {courtCount}
            </span>
            <span className="text-sm text-brand-muted">canchas</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--club-secondary)" }}
            >
              {memberCount}
            </span>
            <span className="text-sm text-brand-muted">jugadores</span>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {metrics.map(({ label, value, empty, Icon, accent }) => {
          const accentColor =
            accent === "secondary" ? "var(--club-secondary)" : "var(--club-primary)";
          return (
            <div
              key={label}
              className="relative bg-brand-surface border border-white/10 rounded-2xl p-6 overflow-hidden"
            >
              {/* Top accent line */}
              <div
                className="absolute inset-x-0 top-0 h-0.5 opacity-70"
                style={{ backgroundColor: accentColor }}
              />
              {/* Ghost watermark */}
              <Icon className="absolute right-4 bottom-4 w-16 h-16 text-white opacity-[0.04]" />
              {/* Icon container */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accentColor} 15%, transparent)`,
                  color: accentColor,
                }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-sm text-brand-muted mb-1">{label}</p>
              <p className="text-3xl font-bold text-white mb-1">{value}</p>
              {value === "—" && (
                <p className="text-xs" style={{ color: "var(--club-secondary)" }}>
                  {empty}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          Acciones rápidas
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map(({ label, Icon, href, color, disabled }) => {
            if (disabled) {
              return (
                <div
                  key={label}
                  className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-brand-surface border border-white/5 opacity-40 cursor-not-allowed"
                >
                  <Icon className="w-6 h-6 text-brand-muted" />
                  <span className="text-xs font-medium text-brand-muted">{label}</span>
                  <span className="text-[10px] font-medium bg-white/5 border border-white/10 text-brand-muted px-1.5 py-0.5 rounded-md flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    Próx.
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={label}
                href={href!}
                style={{ "--qa-color": color } as React.CSSProperties}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--qa-color)] hover:bg-[color-mix(in_srgb,var(--qa-color)_6%,transparent)] transition-colors group"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--qa-color) 15%, transparent)",
                    color: "var(--qa-color)",
                  }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-brand-muted group-hover:text-white transition-colors">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
