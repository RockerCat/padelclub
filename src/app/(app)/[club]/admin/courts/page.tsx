import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { Plus, Home } from "lucide-react";

interface CourtsPageProps {
  params: Promise<{ club: string }>;
}

export default async function CourtsPage({ params }: CourtsPageProps) {
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

  const { data: courts } = await supabase
    .from("courts")
    .select("*")
    .eq("club_id", club.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const courtList = courts ?? [];

  return (
    <div className="p-6 md:p-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Canchas</h1>
          <p className="text-brand-muted mt-1 text-sm">
            Gestiona las canchas del club.
          </p>
        </div>
        <Link
          href={`/${slug}/admin/courts/new`}
          className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Crear cancha
        </Link>
      </div>

      {/* Empty state */}
      {courtList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Home className="w-6 h-6 text-brand-muted" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            No hay canchas registradas
          </h3>
          <p className="text-sm text-brand-muted max-w-sm mb-6">
            Agrega la primera cancha del club para empezar a gestionar reservaciones.
          </p>
          <Link
            href={`/${slug}/admin/courts/new`}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Crear cancha
          </Link>
        </div>
      )}

      {/* Courts list */}
      {courtList.length > 0 && (
        <div className="flex flex-col gap-3">
          {courtList.map((court) => (
            <Link
              key={court.id}
              href={`/${slug}/admin/courts/${court.id}`}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-brand-surface border border-white/10 hover:border-brand-primary/25 hover:bg-brand-primary/5 transition-colors group"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Home className="w-5 h-5 text-brand-muted group-hover:text-brand-primary transition-colors" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white truncate">
                    {court.name}
                  </span>
                  <Badge variant={court.is_active ? "success" : "default"} size="sm">
                    {court.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                {(court.surface || court.is_indoor !== null) && (
                  <p className="text-xs text-brand-muted mt-0.5">
                    {[
                      court.surface,
                      court.is_indoor === true
                        ? "Interior"
                        : court.is_indoor === false
                        ? "Exterior"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>

              {/* Chevron */}
              <svg
                className="w-4 h-4 text-brand-muted shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
