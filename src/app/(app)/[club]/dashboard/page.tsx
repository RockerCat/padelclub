import { notFound, redirect } from "next/navigation";
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
