import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClubStatistics } from "@/lib/clubStatistics";
import { resolveStatsPeriodKey, resolveStatsPeriod } from "@/lib/clubStatisticsRange";
import { PeriodSelector } from "./PeriodSelector";
import { StatsKpiGrid } from "./StatsKpiGrid";
import { TimelineChart } from "./TimelineChart";
import { StatusDistributionChart } from "./StatusDistributionChart";
import { CourtUsageList } from "./CourtUsageList";
import { WeekdayActivityChart } from "./WeekdayActivityChart";
import { HourlySlotsChart } from "./HourlySlotsChart";

interface StatisticsPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ period?: string }>;
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 sm:p-5">
      <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-1">{title}</h2>
      {subtitle && <p className="text-[11px] text-brand-muted/70 mb-3">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-4"}>{children}</div>
    </div>
  );
}

// Estadísticas operativas del club — Phase 9. OWNER/ADMIN only, strictly
// read-only (no action on this page creates or modifies any data). A club
// archived (Phase 8) is still fully readable here — get_club_statistics
// never checks clubs.archived_at, since read access to history is never
// blocked by archival; the shared "club archivado" banner in the parent
// layout already covers the rest.
export default async function StatisticsPage({ params, searchParams }: StatisticsPageProps) {
  const { club: slug } = await params;
  const { period: periodParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug")
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

  const periodKey = resolveStatsPeriodKey(periodParam);
  const { start, end } = resolveStatsPeriod(periodKey);

  const { data: stats, error } = await getClubStatistics(supabase, club.id, start, end);

  return (
    <div className="p-6 md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Estadísticas</h1>
          <p className="text-brand-muted mt-1 text-sm">
            Uso real de {club.name} a partir de las reservas registradas.
          </p>
        </div>
        <PeriodSelector value={periodKey} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {stats && stats.summary.totalReservations === 0 && (
        <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-white/10">
          <p className="text-white font-semibold mb-1">Aún no hay actividad en este periodo</p>
          <p className="text-sm text-brand-muted max-w-sm mx-auto">
            Cuando el club tenga reservas, aquí verás su evolución y uso por cancha.
          </p>
        </div>
      )}

      {stats && stats.summary.totalReservations > 0 && (
        <div className="flex flex-col gap-6">
          <StatsKpiGrid summary={stats.summary} previousSummary={stats.previousSummary} />

          <SectionCard
            title="Evolución de reservas"
            subtitle="Todas las reservas del periodo (confirmadas, pendientes, canceladas y rechazadas), por fecha de la reserva."
          >
            <TimelineChart points={stats.timeline} granularity={stats.timelineGranularity} />
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Distribución por estado">
              <StatusDistributionChart statuses={stats.statuses} />
            </SectionCard>

            <SectionCard title="Uso por cancha">
              {stats.courts.length === 0 ? (
                <p className="text-sm text-brand-muted/70">Sin reservas confirmadas en este periodo.</p>
              ) : (
                <CourtUsageList courts={stats.courts} />
              )}
            </SectionCard>

            <SectionCard title="Actividad por día de la semana">
              <WeekdayActivityChart weekdays={stats.weekdays} />
            </SectionCard>

            <SectionCard title="Actividad por franja horaria">
              {stats.hourlySlots.length === 0 ? (
                <p className="text-sm text-brand-muted/70">Sin reservas confirmadas en este periodo.</p>
              ) : (
                <HourlySlotsChart hourlySlots={stats.hourlySlots} />
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
