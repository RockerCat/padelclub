import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewsGrid } from "./NewsGrid";
import type { ClubNewsWithAuthor } from "@/types/database";

interface NewsPageProps {
  params: Promise<{ club: string }>;
}

export default async function NewsPage({ params }: NewsPageProps) {
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

  const { data: news } = await supabase
    .from("club_news")
    .select("*, created_by_profile:profiles!club_news_created_by_fkey(full_name)")
    .eq("club_id", club.id)
    .order("published_at", { ascending: false });

  return (
    <div className="p-6 md:p-10">
      <NewsGrid news={(news ?? []) as ClubNewsWithAuthor[]} clubSlug={slug} clubId={club.id} />
    </div>
  );
}
