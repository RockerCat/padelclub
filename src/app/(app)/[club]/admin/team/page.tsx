import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamClient } from "./TeamClient";

interface TeamPageProps {
  params: Promise<{ club: string }>;
}

type TeamMemberRow = {
  id: string;
  club_id: string;
  profile_id: string;
  role: "OWNER" | "ADMIN";
  is_active: boolean;
  joined_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
};

type InviteLinkRow = {
  id: string;
  token: string;
  role: "PLAYER" | "ADMIN";
  expires_at: string;
  uses: number;
  max_uses: number | null;
};

export default async function TeamPage({ params }: TeamPageProps) {
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
  if (membership.role !== "OWNER") redirect(`/${slug}`);

  const [teamResult, inviteResult] = await Promise.all([
    supabase
      .from("club_members")
      .select(
        "id, club_id, profile_id, role, is_active, joined_at, profiles(full_name, avatar_url, phone)"
      )
      .eq("club_id", club.id)
      .in("role", ["OWNER", "ADMIN"])
      .order("joined_at", { ascending: true }),
    supabase
      .from("invitation_links")
      .select("id, token, role, expires_at, uses, max_uses")
      .eq("club_id", club.id)
      .eq("role", "ADMIN")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  const teamMembers = (teamResult.data ?? []) as TeamMemberRow[];
  const owner = teamMembers.find((m) => m.role === "OWNER") ?? null;
  const admins = teamMembers.filter((m) => m.role === "ADMIN");
  const activeInvites = (inviteResult.data ?? []) as InviteLinkRow[];

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Equipo del club</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Gestiona quién opera el club.
        </p>
      </div>

      <TeamClient
        clubId={club.id}
        clubSlug={slug}
        owner={owner}
        admins={admins}
        currentUserId={user.id}
        activeInvites={activeInvites}
      />
    </div>
  );
}
