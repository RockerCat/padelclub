import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(membership.role)) redirect(`/${slug}`);

  // Single query for the whole list — club_id filtered explicitly (never
  // relying on RLS alone, RLS remains defense-in-depth). No entries/matches/
  // allocations/profiles joined here — out of scope for Bloque 2.1.
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .eq("club_id", club.id);

  const tournamentList = [...(tournaments ?? [])].sort(compareTournaments);

  const { data: sportCategories } = await supabase
    .from("sport_categories")
    .select("code, sort_order, created_at")
    .order("sort_order", { ascending: true });

  return (
    <div className="p-6 md:p-10">
      <TournamentsGrid
        tournaments={tournamentList}
        categories={sportCategories ?? []}
        clubSlug={slug}
        clubId={club.id}
      />
    </div>
  );
}
