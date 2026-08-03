import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { compareTournaments } from "@/lib/tournamentSort";
import { TournamentsGrid } from "../admin/tournaments/TournamentsGrid";

interface PlayerTournamentsPageProps {
  params: Promise<{ club: string }>;
}

// Minimal PLAYER-facing list (Bloque 2.2) — no create/edit/transition
// actions here, those remain OWNER/ADMIN-only under /admin/tournaments.
// RLS (tournaments_select_member) already excludes draft tournaments for
// non-admin roles; club_id is still filtered explicitly regardless.
// Reuses the exact same tabbed TournamentsGrid OWNER/ADMIN already use
// (role="PLAYER" only hides "Crear torneo" and the Borradores/Archivados
// tabs — everything else, filtering, default tab, cards, detail
// navigation, is identical code) instead of a second, simplified list.
export default async function PlayerTournamentsPage({ params }: PlayerTournamentsPageProps) {
  const { club: slug } = await params;

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

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .eq("club_id", club.id);

  const tournamentList = [...(tournaments ?? [])].sort(compareTournaments);

  return (
    <div className="p-6 md:p-10">
      <TournamentsGrid tournaments={tournamentList} clubSlug={slug} clubId={club.id} role="PLAYER" />
    </div>
  );
}
