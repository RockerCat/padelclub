import { redirect, notFound } from "next/navigation";
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

  const { data: membership } = await supabase
    .from("club_members")
    .select("role, clubs!inner(slug)")
    .eq("clubs.slug", slug)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    notFound();
  }

  // Only OWNERs can access the dashboard
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
        {[
          { label: "Reservas del mes", value: "—" },
          { label: "Jugadores activos", value: "—" },
          { label: "Ocupación promedio", value: "—" },
        ].map((metric) => (
          <div
            key={metric.label}
            className="bg-brand-surface border border-white/10 rounded-2xl p-6"
          >
            <p className="text-sm text-brand-muted mb-2">{metric.label}</p>
            <p className="text-3xl font-bold text-white">{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
