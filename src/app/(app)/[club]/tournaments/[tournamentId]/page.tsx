import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import {
  tournamentCategoryLabel,
  tournamentStatusBadgeVariant,
  tournamentStatusLabel,
  tournamentVisibilityLabel,
} from "@/lib/tournamentLabels";
import { getTournamentEntriesWithMembers, summarizeCapacity } from "@/lib/tournamentEntries";
import { EntriesSection } from "@/components/tournaments/EntriesSection";
import { ClassificationSection } from "@/components/tournaments/ClassificationSection";

interface PlayerTournamentDetailPageProps {
  params: Promise<{ club: string; tournamentId: string }>;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Sin definir";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Minimal PLAYER-facing detail — read-only tournament summary plus the same
// shared EntriesSection used by the OWNER/ADMIN detail page, in "PLAYER"
// role mode (register/withdraw only, no confirm/reject, no edit/transition
// actions). Never the public view (out of scope) — this route requires an
// active club membership like every other page under [club].
export default async function PlayerTournamentDetailPage({ params }: PlayerTournamentDetailPageProps) {
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

  // OWNER/ADMIN already have a richer detail page with editing/transition
  // actions — send them there instead of the read-only PLAYER view.
  if (membership.role === "OWNER" || membership.role === "ADMIN") {
    redirect(`/${slug}/admin/tournaments/${tournamentId}`);
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .eq("club_id", club.id)
    .single();

  if (!tournament) notFound();

  // Categorías reales a resolver por jugador (máximo 2: category +
  // secondary_category si el torneo es combinado).
  const tournamentCategories = [tournament.category, tournament.secondary_category].filter(
    (c): c is string => !!c
  );

  const [{ entries, error: entriesError }, ownStateRes, ownProfileRes] = await Promise.all([
    getTournamentEntriesWithMembers(supabase, tournament.id, club.id, tournamentCategories),
    supabase.rpc("get_club_member_sport_state", { p_club_id: club.id, p_club_member_id: membership.id }),
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
  ]);

  const capacity = summarizeCapacity(entries, tournament.max_pairs);
  const ownCategory = ownStateRes.data?.[0]?.category ?? null;
  const ownProfile = ownProfileRes.data;

  return (
    <div className="p-6 md:p-10">
      <Link
        href={`/${slug}/tournaments`}
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Torneos
      </Link>

      {tournament.cover_image_url && (
        <div className="w-full max-w-3xl aspect-[21/9] rounded-2xl overflow-hidden mb-6 border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tournament.cover_image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
          <Badge variant={tournamentStatusBadgeVariant(tournament.status)} size="sm">
            {tournamentStatusLabel(tournament.status)}
          </Badge>
          {tournament.status === "in_progress" && (
            <Badge variant="danger" size="sm">
              En vivo
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-brand-muted">
            {tournament.visibility === "public" ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {tournamentVisibilityLabel(tournament.visibility)}
          </span>
        </div>
        {tournament.description && <p className="text-brand-muted text-sm max-w-2xl">{tournament.description}</p>}
      </div>

      <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-3xl mb-8">
        <div>
          <p className="text-xs text-brand-muted mb-1">Categoría</p>
          <p className="text-sm text-white font-medium">
            {tournamentCategoryLabel(tournament.category, tournament.secondary_category)}
          </p>
        </div>
        <div>
          <p className="text-xs text-brand-muted mb-1">Cupo máximo</p>
          <p className="text-sm text-white font-medium">{tournament.max_pairs} parejas</p>
        </div>
        {tournament.prize_description && (
          <div>
            <p className="text-xs text-brand-muted mb-1">Premios</p>
            <p className="text-sm text-white font-medium">{tournament.prize_description}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-brand-muted mb-1">Inicio</p>
          <p className="text-sm text-white font-medium">{formatDateTime(tournament.starts_at)}</p>
        </div>
        <div>
          <p className="text-xs text-brand-muted mb-1">Fin</p>
          <p className="text-sm text-white font-medium">{formatDateTime(tournament.ends_at)}</p>
        </div>
      </div>

      {entriesError ? (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-3xl">
          {entriesError}
        </p>
      ) : (
        <EntriesSection
          tournament={tournament}
          initialEntries={entries}
          capacity={capacity}
          role="PLAYER"
          ownClubMemberId={membership.id}
          ownUserId={user.id}
          ownFullName={ownProfile?.full_name ?? null}
          ownAvatarUrl={ownProfile?.avatar_url ?? null}
          ownCategory={ownCategory}
          revalidatePaths={[`/${slug}/tournaments/${tournament.id}`]}
        />
      )}

      {(tournament.status === "in_progress" || tournament.status === "completed") && (
        <div className="mt-8 max-w-3xl">
          <h2 className="text-lg font-semibold text-white mb-4">
            {tournament.status === "completed" ? "Podio y clasificación final" : "Clasificación"}
          </h2>
          <ClassificationSection
            clubId={club.id}
            tournamentId={tournament.id}
            entries={entries}
            editable={false}
            revalidatePaths={[`/${slug}/tournaments/${tournament.id}`]}
          />
        </div>
      )}
    </div>
  );
}
