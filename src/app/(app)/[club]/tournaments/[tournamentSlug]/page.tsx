import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentEntriesWithMembers, summarizeCapacity } from "@/lib/tournamentEntries";
import { TournamentDetailView } from "@/components/tournaments/TournamentDetailView";

interface TournamentDetailPageProps {
  params: Promise<{ club: string; tournamentSlug: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// URL canónica del detalle de torneo para OWNER, ADMIN y PLAYER — una
// sola vista compartida (TournamentDetailView); lo único que cambia por
// rol son las acciones administrativas y los datos de participación
// propia, nunca el layout. /admin/tournaments/[slug] sigue existiendo
// solo como redirect hacia aquí (compatibilidad de enlaces antiguos).
export default async function TournamentDetailPage({ params }: TournamentDetailPageProps) {
  const { club: slug, tournamentSlug } = await params;

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
    .select("id, role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");

  // Compatibilidad con enlaces antiguos basados en UUID (incluida la
  // vieja ruta /admin/tournaments/<uuid>): si el parámetro tiene forma de
  // UUID, se resuelve por id (siempre acotado a club_id) y se redirige de
  // inmediato a la URL canónica con slug. Si no, se resuelve normalmente
  // por (club_id, slug). RLS permanece como defensa adicional en ambos
  // casos.
  const { data: tournament } = UUID_RE.test(tournamentSlug)
    ? await supabase.from("tournaments").select("*").eq("id", tournamentSlug).eq("club_id", club.id).single()
    : await supabase.from("tournaments").select("*").eq("slug", tournamentSlug).eq("club_id", club.id).single();

  if (!tournament) notFound();

  if (UUID_RE.test(tournamentSlug)) {
    redirect(`/${slug}/tournaments/${tournament.slug}`);
  }

  const role = membership.role as "OWNER" | "ADMIN" | "PLAYER";
  const isAdmin = role === "OWNER" || role === "ADMIN";

  // Categorías del club: siempre se cargan (las necesita el formulario de
  // edición de OWNER/ADMIN); costo mínimo, evita props condicionales.
  const { data: sportCategories } = await supabase
    .from("sport_categories")
    .select("code, sort_order, created_at")
    .order("sort_order", { ascending: true });

  // Categorías reales a resolver por jugador (máximo 2: category +
  // secondary_category si el torneo es combinado).
  const tournamentCategories = [tournament.category, tournament.secondary_category].filter(
    (c): c is string => !!c
  );

  const [{ entries, error: entriesError }, ownStateRes, ownProfileRes, existingNewsRes] = await Promise.all([
    getTournamentEntriesWithMembers(supabase, tournament.id, club.id, tournamentCategories),
    // Participación propia solo tiene sentido para PLAYER — OWNER/ADMIN
    // nunca se autoinscriben (misma regla que ya regía la página admin).
    isAdmin
      ? Promise.resolve({ data: null as { category: string | null }[] | null })
      : supabase.rpc("get_club_member_sport_state", { p_club_id: club.id, p_club_member_id: membership.id }),
    isAdmin
      ? Promise.resolve({ data: null as { full_name: string | null; avatar_url: string | null } | null })
      : supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    // Cierre editorial — única fuente real de "¿ya existe una noticia
    // para este torneo?": tournament_id explícito en club_news, nunca
    // adivinado por título/contenido/fecha. Solo importa para
    // OWNER/ADMIN en un torneo completed, pero es barato y sin
    // condicionales cargarlo siempre igual que sportCategories arriba.
    supabase.from("club_news").select("slug").eq("tournament_id", tournament.id).maybeSingle(),
  ]);

  const capacity = summarizeCapacity(entries, tournament.max_pairs);
  const ownCategory = ownStateRes.data?.[0]?.category ?? null;
  const ownProfile = ownProfileRes.data;
  const existingNewsSlug = existingNewsRes.data?.slug ?? null;

  return (
    <div className="p-6 md:p-10">
      <TournamentDetailView
        tournament={tournament}
        categories={sportCategories ?? []}
        clubSlug={slug}
        clubId={club.id}
        entries={entries}
        entriesError={entriesError}
        capacity={capacity}
        role={role}
        ownClubMemberId={membership.id}
        ownUserId={user.id}
        ownFullName={ownProfile?.full_name ?? null}
        ownAvatarUrl={ownProfile?.avatar_url ?? null}
        ownCategory={ownCategory}
        existingNewsSlug={existingNewsSlug}
      />
    </div>
  );
}
