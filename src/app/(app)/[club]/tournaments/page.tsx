import { notFound, redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { compareTournaments } from "@/lib/tournamentSort";
import { TournamentCard } from "../admin/tournaments/TournamentCard";

interface PlayerTournamentsPageProps {
  params: Promise<{ club: string }>;
}

// Minimal PLAYER-facing list (Bloque 2.2) — no create/edit/transition
// actions here, those remain OWNER/ADMIN-only under /admin/tournaments.
// RLS (tournaments_select_member) already excludes draft tournaments for
// non-admin roles; club_id is still filtered explicitly regardless.
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Torneos</h1>
        <p className="text-brand-muted mt-1 text-sm">Consulta los torneos del club e inscríbete con tu partner.</p>
      </div>

      {tournamentList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Trophy className="w-6 h-6 text-brand-muted" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">Aún no hay torneos</h3>
          <p className="text-sm text-brand-muted max-w-sm">El club todavía no ha publicado torneos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournamentList.map((t) => (
            <TournamentCard key={t.id} tournament={t} href={`/${slug}/tournaments/${t.slug}`} />
          ))}
        </div>
      )}
    </div>
  );
}
