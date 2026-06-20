import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CourtsGrid } from "./CourtsGrid";
import { CreateCourtButton } from "./CreateCourtButton";
import { Home } from "lucide-react";

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
    .order("name", { ascending: true });

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
        <CreateCourtButton clubSlug={slug} clubId={club.id} />
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
          <CreateCourtButton
            clubSlug={slug}
            clubId={club.id}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200"
          />
        </div>
      )}

      {/* Courts grid — expandable cards, edit inline without leaving the page */}
      {courtList.length > 0 && (
        <CourtsGrid courts={courtList} clubSlug={slug} clubId={club.id} />
      )}
    </div>
  );
}
