import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { Badge } from "@/components/ui";
import { CourtForm } from "../CourtForm";
import { updateCourt } from "../actions";
import { ToggleActiveButton } from "./ToggleActiveButton";

interface CourtDetailPageProps {
  params: Promise<{ club: string; id: string }>;
}

export default async function CourtDetailPage({ params }: CourtDetailPageProps) {
  const { club: slug, id: courtId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!club) notFound();

  const access = await resolveClubAccess(supabase, club.id);
  if (!access.authorized) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(access.role)) redirect(`/${slug}`);

  const { data: court } = await supabase
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .eq("club_id", club.id)
    .single();

  if (!court) notFound();

  const boundAction = updateCourt.bind(null, club.id, court.id);

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{court.name}</h1>
            <Badge variant={court.is_active ? "success" : "default"} size="sm">
              {court.is_active ? "Activa" : "Inactiva"}
            </Badge>
          </div>
          <p className="text-brand-muted text-sm">Editar información de la cancha.</p>
        </div>
        <ToggleActiveButton
          clubId={club.id}
          courtId={court.id}
          isActive={court.is_active}
        />
      </div>
      <CourtForm
        clubSlug={slug}
        clubId={club.id}
        court={court}
        action={boundAction}
      />
    </div>
  );
}
