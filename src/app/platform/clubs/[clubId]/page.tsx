import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Users,
  CalendarDays,
  Megaphone,
  Home,
  Lock,
  Power,
  UserCog,
  LogIn,
  Building2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button } from "@/components/ui";

interface PageProps {
  params: Promise<{ clubId: string }>;
}

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

function StatBox({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 text-brand-muted shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-lg font-bold text-white tabular-nums leading-none">{value}</p>
        <p className="text-xs text-brand-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function SoonButton({
  label,
  Icon,
  variant = "secondary",
}: {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  variant?: "secondary" | "danger";
}) {
  return (
    <Button variant={variant} disabled className="justify-between w-full sm:w-auto">
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      <span className="text-[10px] font-medium bg-white/10 text-brand-muted px-1.5 py-0.5 rounded-md flex items-center gap-1 ml-2">
        <Lock className="w-2.5 h-2.5" />
        Próximamente
      </span>
    </Button>
  );
}

export default async function PlatformClubDetailPage({ params }: PageProps) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_platform_club_detail", { p_club_id: clubId });
  const club = data?.[0];

  if (!club && !error) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <Link
        href="/platform/clubs"
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Clubes
      </Link>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudo cargar el club ({error.message}).
        </div>
      )}

      {club && (
        <>
          {/* ── Información general ─────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden bg-white/5 text-brand-muted ring-1 ring-white/10">
                {club.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={club.logo_url} alt={`Logo de ${club.name}`} className="w-full h-full object-cover" />
                ) : (
                  getInitials(club.name)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-white">{club.name}</h1>
                <p className="text-sm text-brand-muted">/{club.slug}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Badge variant={club.is_active ? "success" : "danger"} size="sm">
                    {club.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                  <Badge variant={club.visibility === "public" ? "outline" : "secondary"} size="sm">
                    {club.visibility === "public" ? "Pública" : "Privada"}
                  </Badge>
                  <span className="text-xs text-brand-muted">
                    Creado el {formatDate(club.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Owner ────────────────────────────────────────────────── */}
          <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
              Owner
            </h2>
            <p className="text-sm font-medium text-white">{club.owner_name ?? "—"}</p>
            <p className="text-sm text-brand-muted">{club.owner_email ?? "—"}</p>
          </div>

          {/* ── Estadísticas ─────────────────────────────────────────── */}
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
            Estadísticas
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <StatBox label="Administradores" value={club.admin_count} Icon={ShieldCheck} />
            <StatBox label="Jugadores" value={club.player_count} Icon={Users} />
            <StatBox label="Reservas" value={club.reservation_count} Icon={CalendarDays} />
            <StatBox label="Noticias" value={club.news_count} Icon={Megaphone} />
            <StatBox label="Canchas" value={club.court_count} Icon={Home} />
          </div>

          {/* ── Acciones (deshabilitadas por ahora) ─────────────────── */}
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
            Acciones
          </h2>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <SoonButton
              label={club.is_active ? "Desactivar club" : "Activar club"}
              Icon={Power}
              variant="danger"
            />
            <SoonButton label="Cambiar Owner" Icon={UserCog} />
            <SoonButton label="Entrar al club" Icon={LogIn} />
            <SoonButton label="Administrar administradores" Icon={Building2} />
          </div>
        </>
      )}
    </div>
  );
}
