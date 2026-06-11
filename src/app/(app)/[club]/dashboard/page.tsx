import { notFound, redirect } from "next/navigation";
import { CalendarDays, Users, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface DashboardPageProps {
  params: Promise<{ club: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  console.log("[user]", user?.id);
  console.log("[club lookup]", slug);

  // Step 1: resolve slug → club id
  const result = await supabase
    .from("clubs")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  console.log("[club result]", result);
  console.log("[club data]", result.data);
  console.log("[club error]", result.error);

  const club = result.data;

  if (!club) {
    notFound();
  }

  // Step 2: verify the user is an active member and is OWNER
  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  console.log("[membership]", membership);

  if (!membership) {
    redirect("/unauthorized");
  }

  if (membership.role !== "OWNER") {
    redirect(`/${slug}`);
  }

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl font-bold text-white mb-2">
        Dashboard del propietario
      </h1>
      <p className="text-brand-muted mb-8">
        Las métricas aparecerán cuando el club tenga reservas.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(
          [
            { label: "Reservas del mes", value: "—", Icon: CalendarDays },
            { label: "Jugadores activos", value: "—", Icon: Users },
            { label: "Ocupación promedio", value: "—", Icon: TrendingUp },
          ] as const
        ).map(({ label, value, Icon }) => (
          <div
            key={label}
            className="relative bg-brand-surface border border-white/10 rounded-2xl p-6 overflow-hidden"
          >
            {/* Club primary top accent */}
            <div className="absolute inset-x-0 top-0 h-0.5 bg-brand-primary opacity-70" />
            {/* Metric icon */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-4 bg-brand-primary/15 text-brand-primary">
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-sm text-brand-muted mb-1">{label}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
