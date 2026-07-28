import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui";
import { Share2 } from "lucide-react";
import { MembersClient } from "./MembersClient";
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

  // Load PLAYER-role members only
  const { data: members } = await supabase
    .from("club_members")
    .select("id, club_id, profile_id, role, is_active, joined_at, category, profiles(full_name, avatar_url, phone)")
    .eq("club_id", club.id)
    .eq("role", "PLAYER")
    .order("joined_at", { ascending: false });

  // Players' second access path (public and private clubs alike since the
  // "join a public club instantly" placeholder was removed), pending
  // OWNER/ADMIN approval. get_club_join_requests also carries the
  // requester's email (needs auth.users, not reachable from a plain
  // select) and every past request's status, not just pending ones — the
  // section below only renders Aprobar/Rechazar for status === "pending".
  const { data: joinRequests } = await supabase.rpc("get_club_join_requests", {
    p_club_id: club.id,
  });

  // Fase 1 módulo deportivo — catálogo global, fijo, sin scope de club.
  const { data: sportCategories } = await supabase
    .from("sport_categories")
    .select("code, sort_order, created_at")
    .order("sort_order", { ascending: true });

  const memberList = (members ?? []) as Parameters<typeof MembersClient>[0]["members"];
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
      <MembersClient
        members={memberList}
        clubSlug={slug}
        clubId={club.id}
        sportCategories={sportCategories ?? []}
      />

      {/* Solicitudes de ingreso — van por encima de "Compartir club" por
          prioridad operativa. Público y privado usan el mismo flujo de
          solicitud+aprobación. Incluye historial (aprobadas/rechazadas), no
          solo pendientes — JoinRequestsSection decide qué acciones mostrar
          según el status de cada fila. */}
      {requests.length > 0 && (
        <div className="mt-10">
          <JoinRequestsSection clubId={club.id} clubSlug={slug} requests={requests} />
        </div>
      )}

      {/* Incorporación de jugadores — no existen invitaciones para
          jugadores (ver CLAUDE.md → Club Sharing Principles): la única vía
          es compartir el enlace público del club, igual para clubes
          públicos (unión directa) y privados (solicitud de ingreso). */}
      <div className="mt-10">
        <Card variant="default">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-brand-muted" />
              <h2 className="text-base font-semibold text-white">Compartir club</h2>
            </div>
            <p className="text-xs text-brand-muted mt-1">
              Comparte este club con otros jugadores. Podrán ver el perfil del club y unirse o solicitar ingreso.
            </p>
          </CardHeader>
          <CardContent>
            <ShareClubSection clubName={club.name} clubSlug={slug} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
