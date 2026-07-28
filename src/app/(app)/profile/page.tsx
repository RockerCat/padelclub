import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { getMyProfileActivity } from "@/lib/profileActivity";
import { PersonalInfoCard } from "./PersonalInfoCard";
import { MembershipsList } from "./MembershipsList";
import { ProfileSummaryGrid } from "./ProfileSummaryGrid";
import { MonthlyActivityChart } from "./MonthlyActivityChart";
import { TypeDistributionChart } from "./TypeDistributionChart";
import { RecentActivityList } from "./RecentActivityList";

export const metadata: Metadata = {
  title: "Mi Perfil | MiPadelClub",
};

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

// Mi Perfil — Phase 10. Global, account-level page (not club-scoped, no
// club param in the URL) — same top-level route pattern as /notifications
// and /clubs, each of which writes its own auth check rather than sitting
// under (app)/[club]'s club-scoped layout. Read-only: nothing on this page
// creates, edits, cancels, or approves anything.
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?next=/profile");

  // Información personal: resolved the same way every other surface in the
  // app already resolves it (getSidebarIdentity) — independent of the
  // activity RPC below, so a failure in one never hides the other. phone
  // no es parte de getSidebarIdentity (esa función también alimenta el
  // sidebar, que no lo necesita) — se resuelve aparte, en paralelo, solo
  // para esta pantalla.
  const [identity, { data: activity, error }, { data: phoneRow }] = await Promise.all([
    getSidebarIdentity(supabase, user.id, user.email ?? null),
    getMyProfileActivity(supabase),
    supabase.from("profiles").select("phone").eq("id", user.id).single(),
  ]);

  const hasMemberships = !!activity && activity.activeMemberships.length > 0;
  const hasActivity = !!activity && activity.summary.totalReservations > 0;

  return (
    // Single wrapper, same p-6 md:p-10 spacing every other admin screen
    // uses (Dashboard/Estadísticas/Jugadores/Configuración) — no separate
    // min-h-screen/bg-brand-bg div: that background is already guaranteed
    // globally (html, body { background-color: #001A24 } in globals.css)
    // and the full-height context already comes from ClubThemeProvider's
    // own wrapper further up the tree, exactly like every other page under
    // it. max-w-[1140px] mx-auto is kept — that's the two-column desktop
    // width fix from the previous pass, unrelated to this spacing pass.
    <div className="max-w-[1140px] mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold text-white mb-6">Mi Perfil</h1>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* items-start: each column keeps its own natural height — never
          stretched to match the taller one. Single column below lg
          (mobile and tablet unchanged/unbroken); two columns only at
          lg (1024px)+, where there's genuinely enough width for both. */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 lg:gap-8 items-start">
        <div className="flex flex-col gap-6">
          <PersonalInfoCard
            name={identity.name}
            email={identity.email}
            avatarUrl={identity.avatarUrl}
            phone={phoneRow?.phone ?? null}
          />

          {activity && (
            <SectionCard title="Membresías actuales">
              {hasMemberships ? (
                <MembershipsList memberships={activity.activeMemberships} />
              ) : (
                <p className="text-sm text-brand-muted/70">No tienes membresías activas en ningún club.</p>
              )}
            </SectionCard>
          )}
        </div>

        {activity && (
          <div className="flex flex-col gap-6">
            {hasActivity ? (
              <>
                <SectionCard title="Resumen personal">
                  <ProfileSummaryGrid summary={activity.summary} />
                </SectionCard>

                <SectionCard
                  title="Evolución mensual"
                  subtitle="Reservas por fecha reservada de los últimos 12 meses (todos los estados)."
                >
                  <MonthlyActivityChart points={activity.monthlyActivity} />
                </SectionCard>

                <SectionCard title="Distribución por tipo">
                  <TypeDistributionChart points={activity.typeDistribution} />
                </SectionCard>

                <SectionCard title="Actividad reciente">
                  <RecentActivityList reservations={activity.recentReservations} />
                </SectionCard>
              </>
            ) : (
              // Neutral, not an error — this is the expected, correct state
              // for most OWNER/ADMIN accounts today: the admin reservation
              // form has no way to add its own creator as a player, so an
              // operator's administrative bookings never count as personal
              // participation (see get_my_profile_activity's own rule).
              <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-white/10">
                <p className="text-white font-semibold mb-1">Aún no tienes actividad personal registrada</p>
                <p className="text-sm text-brand-muted max-w-sm mx-auto">
                  Las reservas creadas para administrar el club no se cuentan como participación personal.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
