import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicPageSections } from "./PublicPageSections";
import { getClubPublicPageData } from "@/lib/clubPublicPageData";
import type { Club } from "@/types/database";

interface PublicPagePageProps {
  params: Promise<{ club: string }>;
}

export default async function PublicPagePage({ params }: PublicPagePageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const result = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  const club = result.data;
  if (!club) notFound();

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");
  if (membership.role !== "OWNER") redirect(`/${slug}`);

  const { courts, schedule, playerCount } = await getClubPublicPageData(supabase, club.id);

  return (
    <PublicPageSections
      club={club as Club}
      courts={courts}
      schedule={schedule}
      playerCount={playerCount}
      currentUserRole={membership.role}
    />
  );
}
