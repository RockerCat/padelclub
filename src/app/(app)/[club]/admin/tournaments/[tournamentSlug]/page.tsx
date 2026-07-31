import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface TournamentDetailPageProps {
  params: Promise<{ club: string; tournamentSlug: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El detalle del torneo ya no tiene una implementación visual propia
// bajo /admin — la vista es única (TournamentDetailView, compartida con
// OWNER/ADMIN/PLAYER) y vive en la URL canónica /[club]/tournaments/
// [slug]. Esta ruta se conserva únicamente como redirect para no romper
// enlaces/bookmarks antiguos bajo /admin/tournaments/[slug o uuid] — el
// gate de admin/layout.tsx (bloquea PLAYER) sigue aplicando aquí igual
// que a cualquier otra ruta bajo /admin.
export default async function AdminTournamentDetailRedirect({ params }: TournamentDetailPageProps) {
  const { club: slug, tournamentSlug } = await params;

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

  // Resuelto por id (compatibilidad UUID) o por slug — siempre acotado a
  // club_id, nunca solo por uno de los dos identificadores.
  const { data: tournament } = UUID_RE.test(tournamentSlug)
    ? await supabase.from("tournaments").select("slug").eq("id", tournamentSlug).eq("club_id", club.id).single()
    : await supabase.from("tournaments").select("slug").eq("slug", tournamentSlug).eq("club_id", club.id).single();

  if (!tournament) notFound();

  redirect(`/${slug}/tournaments/${tournament.slug}`);
}
