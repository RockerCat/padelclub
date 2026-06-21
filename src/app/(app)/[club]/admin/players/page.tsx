import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui";
import { UserPlus, Share2 } from "lucide-react";
import { MembersClient } from "./MembersClient";
import { InviteManager } from "./InviteManager";
import type { InviteLink } from "./InviteManager";
import { ShareClubSection } from "./ShareClubSection";
import { JoinRequestsSection } from "./JoinRequestsSection";
import type { JoinRequestRow } from "./JoinRequestsSection";

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
    .select("id, name, visibility")
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

  // Load PLAYER-role members only
  const { data: members } = await supabase
    .from("club_members")
    .select("id, club_id, profile_id, role, is_active, joined_at, category, profiles(full_name, avatar_url, phone)")
    .eq("club_id", club.id)
    .eq("role", "PLAYER")
    .order("joined_at", { ascending: false });

  const isPublic = club.visibility !== "private";

  // Private clubs gate access through invitations — load every PLAYER link
  // (not just active ones) so revoked/used links still show their status.
  const { data: inviteLinks } = isPublic
    ? { data: null }
    : await supabase
        .from("invitation_links")
        .select("id, token, uses, max_uses, is_active, created_at")
        .eq("club_id", club.id)
        .eq("role", "PLAYER")
        .order("created_at", { ascending: false });

  // Players' second access path on private clubs, pending OWNER/ADMIN
  // approval. Queried unconditionally (not gated by isPublic) — this is the
  // exact same club_id-only filter the sidebar badge's
  // getPendingJoinRequestsCount uses, so the two can never disagree. A
  // public club has none left to show because saving that change deletes
  // them (see settings/actions.ts's updateClubVisibility), not because this page
  // hides the section.
  const { data: joinRequests } = await supabase
    .from("club_join_requests")
    .select("id, created_at, profiles(full_name)")
    .eq("club_id", club.id)
    .order("created_at", { ascending: true });

  const memberList = (members ?? []) as Parameters<typeof MembersClient>[0]["members"];
  const links = (inviteLinks ?? []) as InviteLink[];
  const requests = (joinRequests ?? []) as JoinRequestRow[];

  return (
    <div className="p-6 md:p-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Jugadores</h1>
        <p className="text-brand-muted mt-1 text-sm">
          {memberList.length} {memberList.length === 1 ? "jugador" : "jugadores"} en el club.
        </p>
      </div>

      {/* Members list */}
      <MembersClient members={memberList} clubSlug={slug} clubId={club.id} />

      {/* Solicitudes de ingreso — más prioritarias operativamente que las
          invitaciones, por eso van por encima. Gated solo por si hay datos,
          no por isPublic: un club público ya no debería tener ninguna
          pendiente (ver updateClubVisibility), así que esta condición sola basta. */}
      {requests.length > 0 && (
        <div className="mt-10">
          <JoinRequestsSection clubId={club.id} clubSlug={slug} requests={requests} />
        </div>
      )}

      {/* Incorporación de jugadores — adapta según visibilidad del club:
          público promociona el perfil, privado controla el acceso. */}
      <div className="mt-10">
        <Card variant="default">
          {isPublic ? (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-brand-muted" />
                  <h2 className="text-base font-semibold text-white">Compartir club</h2>
                </div>
                <p className="text-xs text-brand-muted mt-1">
                  Comparte tu club para que nuevos jugadores puedan registrarse y unirse.
                </p>
              </CardHeader>
              <CardContent>
                <ShareClubSection clubName={club.name} clubSlug={slug} />
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-brand-muted" />
                  <h2 className="text-base font-semibold text-white">Invitar jugadores</h2>
                </div>
                <p className="text-xs text-brand-muted mt-1">
                  Genera un link de un solo uso para que un nuevo jugador se una al club.
                </p>
              </CardHeader>
              <CardContent>
                <InviteManager clubId={club.id} clubSlug={slug} links={links} />
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
