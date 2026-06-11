import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CourtForm } from "../CourtForm";
import { createCourt } from "../actions";

interface NewCourtPageProps {
  params: Promise<{ club: string }>;
}

export default async function NewCourtPage({ params }: NewCourtPageProps) {
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
  if (!["OWNER", "ADMIN"].includes(membership.role)) redirect(`/${slug}`);

  const boundAction = createCourt.bind(null, club.id);

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Nueva cancha</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Agrega una nueva cancha al club.
        </p>
      </div>
      <CourtForm clubSlug={slug} clubId={club.id} action={boundAction} />
    </div>
  );
}
