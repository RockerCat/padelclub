import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClubEntryPath } from "@/lib/utils/navigation";
import type { ClubRole } from "@/types/database";

interface ClubHomePageProps {
  params: Promise<{ club: string }>;
}

export default async function ClubHomePage({ params }: ClubHomePageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug")
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

  redirect(getClubEntryPath(slug, membership.role as ClubRole));
}
