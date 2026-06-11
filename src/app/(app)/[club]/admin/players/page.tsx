import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui";
import { UserPlus } from "lucide-react";
import { MembersClient } from "./MembersClient";
import { InviteManager } from "./InviteManager";
import type { InviteLink } from "./InviteManager";

interface PlayersPageProps {
  params: Promise<{ club: string }>;
}

export default async function PlayersPage({ params }: PlayersPageProps) {
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

  const callerRole = membership.role as "OWNER" | "ADMIN";

  // Load all members with profiles
  const { data: members } = await supabase
    .from("club_members")
    .select("id, club_id, profile_id, role, is_active, joined_at, profiles(full_name, avatar_url, phone)")
    .eq("club_id", club.id)
    .order("joined_at", { ascending: false });

  // Load active invitation links
  const { data: inviteLinks } = await supabase
    .from("invitation_links")
    .select("id, token, role, expires_at, uses, max_uses")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const memberList = (members ?? []) as Parameters<typeof MembersClient>[0]["members"];
  const activeLinks = (inviteLinks ?? []) as InviteLink[];

  return (
    <div className="p-6 md:p-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Jugadores</h1>
        <p className="text-brand-muted mt-1 text-sm">
          {memberList.length} {memberList.length === 1 ? "miembro" : "miembros"} en el club.
        </p>
      </div>

      {/* Members list */}
      <MembersClient members={memberList} clubSlug={slug} />

      {/* Invite section */}
      <div className="mt-10">
        <Card variant="default">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand-muted" />
              <h2 className="text-base font-semibold text-white">Invitar miembros</h2>
            </div>
            <p className="text-xs text-brand-muted mt-1">
              Comparte un link para que nuevos miembros se unan al club. Los links expiran en 7 días.
            </p>
          </CardHeader>
          <CardContent>
            <InviteManager
              clubId={club.id}
              clubSlug={slug}
              callerRole={callerRole}
              activeLinks={activeLinks}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
