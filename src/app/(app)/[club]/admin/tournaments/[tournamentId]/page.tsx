import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentDetailActions } from "./TournamentDetailActions";
import { getTournamentEntriesWithMembers, summarizeCapacity } from "@/lib/tournamentEntries";
import { getTournamentBracketView } from "@/lib/tournamentBracket";

interface TournamentDetailPageProps {
  params: Promise<{ club: string; tournamentId: string }>;
}

export default async function TournamentDetailPage({ params }: TournamentDetailPageProps) {
  const { club: slug, tournamentId } = await params;

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
    .select("id, role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(membership.role)) redirect(`/${slug}`);

  // Filtered by id AND club_id explicitly — never trusting tournamentId
  // alone, RLS remains defense-in-depth (CLAUDE.md → Seguridad de aplicación).
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .eq("club_id", club.id)
    .single();

  if (!tournament) notFound();

  const { data: sportCategories } = await supabase
    .from("sport_categories")
    .select("code, sort_order, created_at")
    .order("sort_order", { ascending: true });

  const { entries, error: entriesError } = await getTournamentEntriesWithMembers(supabase, tournament.id, club.id);
  const capacity = summarizeCapacity(entries, tournament.bracket_size);
  const { rounds, error: bracketError } = await getTournamentBracketView(
    supabase,
    tournament.id,
    club.id,
    tournament.bracket_size
  );

  return (
    <div className="p-6 md:p-10">
      <TournamentDetailActions
        tournament={tournament}
        categories={sportCategories ?? []}
        clubSlug={slug}
        clubId={club.id}
        entries={entries}
        entriesError={entriesError}
        capacity={capacity}
        rounds={rounds}
        bracketError={bracketError}
        role={membership.role as "OWNER" | "ADMIN"}
        ownClubMemberId={membership.id}
        ownUserId={user.id}
      />
    </div>
  );
}
