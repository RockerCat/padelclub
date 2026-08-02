import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { TournamentsGrid } from "./TournamentsGrid";
import { compareTournaments } from "@/lib/tournamentSort";

interface TournamentsPageProps {
  params: Promise<{ club: string }>;
}

export default async function TournamentsPage({ params }: TournamentsPageProps) {
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

  // resolveClubAccess also recognizes SUPERADMIN's elevated "Entrar al
  // club" access (never a club_members row) for an active club — the
  // parent layouts already granted it; this page must not re-reject it
  // with its own independent membership check.
  const access = await resolveClubAccess(supabase, club.id);
  if (!access.authorized) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(access.role)) redirect(`/${slug}`);

  // Single query for the whole list — club_id filtered explicitly (never
  // relying on RLS alone, RLS remains defense-in-depth).
  const [{ data: tournaments }, { data: confirmedEntries }, { data: sportCategories }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("club_id", club.id),
    supabase.from("tournament_entries").select("tournament_id").eq("club_id", club.id).eq("status", "confirmed"),
    supabase.from("sport_categories").select("code, sort_order, created_at").order("sort_order", { ascending: true }),
  ]);

  const tournamentList = [...(tournaments ?? [])].sort(compareTournaments);

  // Conteo de duplas confirmadas por torneo — una sola consulta agregada
  // en JS (PostgREST no ofrece GROUP BY), nunca una consulta por torneo.
  const confirmedCountByTournamentId = new Map<string, number>();
  for (const row of confirmedEntries ?? []) {
    confirmedCountByTournamentId.set(row.tournament_id, (confirmedCountByTournamentId.get(row.tournament_id) ?? 0) + 1);
  }

  return (
    <div className="p-6 md:p-10">
      <TournamentsGrid
        tournaments={tournamentList}
        confirmedCountByTournamentId={Object.fromEntries(confirmedCountByTournamentId)}
        categories={sportCategories ?? []}
        clubSlug={slug}
        clubId={club.id}
      />
    </div>
  );
}
