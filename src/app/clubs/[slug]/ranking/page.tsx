import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RankingView } from "@/app/(app)/[club]/ranking/RankingView";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("clubs").select("name").eq("slug", slug).eq("is_active", true).single();
  if (!data) return { title: "Club no encontrado | MiPadelClub" };
  return { title: `Ranking de ${data.name} | MiPadelClub` };
}

// Bloque 3.2–3.3 — ranking público del club, enlazado desde la página
// pública (/[club] → ClubPublicView). Reutiliza RankingView en modo
// `readOnly` (nunca las acciones administrativas), mismas RPCs, mismo
// orden de categorías, sin ninguna mutación.
//
// Regla de acceso definitiva (backend ajustado en
// 20260920000001_public_club_ranking_read.sql — ver auditoría del
// Bloque 3.2–3.3): get_club_category_ranking(_view) ahora permite lectura
// de un club público (visibility='public', no archivado) a CUALQUIER
// llamador, autenticado o no, miembro o no; para un club privado sigue
// exigiendo membresía activa exactamente como antes. Esta página replica
// esa misma regla en el servidor (nunca confía únicamente en que la RPC
// vaya a rechazar): un club privado sin membresía activa se resuelve con
// el mismo patrón ya usado en el resto del sitio — /auth/login (sin
// sesión) o /unauthorized (con sesión, sin membresía activa en este club)
// — nunca un flujo nuevo. Un club público nunca redirige, con o sin
// sesión.
export default async function ClubPublicRankingPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug, visibility, logo_url, default_player_category")
    .eq("slug", slug)
    .eq("is_active", true)
    .is("archived_at", null)
    .single();

  if (!club) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const membership = user
    ? (
        await supabase
          .from("club_members")
          .select("id, role")
          .eq("club_id", club.id)
          .eq("profile_id", user.id)
          .eq("is_active", true)
          .single()
      ).data
    : null;

  const isPublic = club.visibility === "public";

  // No filtra ningún dato del Ranking antes de esta comprobación — ver
  // Privacidad §"Para clubes privados, no filtrar nombres, puntos ni
  // posiciones antes de comprobar membresía activa".
  if (!isPublic && !membership) {
    if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/clubs/${slug}/ranking`)}`);
    redirect("/unauthorized");
  }

  const { data: categories } = await supabase
    .from("sport_categories")
    .select("code, sort_order, created_at")
    .order("sort_order", { ascending: true });
  const categoryList = categories ?? [];

  // Misma resolución de categoría inicial que la vista administrativa
  // (Bloque 3.1, admin/[club]/ranking/page.tsx) cuando el visitante es
  // miembro: propia categoría si ya tiene estado deportivo. Un visitante
  // sin membresía (público, sin sesión o sin pertenecer al club) no tiene
  // categoría propia que resolver — cae directo a la del club o la
  // primera del catálogo, nunca un valor fijo.
  let initialCategory: string | null = null;
  if (membership) {
    const { data: ownState } = await supabase.rpc("get_club_member_sport_state", {
      p_club_id: club.id,
      p_club_member_id: membership.id,
    });
    if (ownState && ownState.length > 0) initialCategory = ownState[0].category;
  }
  if (!initialCategory) {
    initialCategory = club.default_player_category ?? categoryList[0]?.code ?? null;
  }

  let initialRanking: Array<{
    ranking_position: number;
    club_member_id: string;
    profile_id: string;
    full_name: string | null;
    avatar_url: string | null;
    current_points: number;
  }> = [];
  let initialError: string | null = null;

  if (initialCategory) {
    const { data: rankingRows, error: rankingError } = await supabase.rpc("get_club_category_ranking_view", {
      p_club_id: club.id,
      p_category: initialCategory,
    });
    if (rankingError) {
      initialError = "No se pudo cargar el ranking. Intenta de nuevo.";
    } else {
      initialRanking = rankingRows ?? [];
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center">
          <Link
            href={`/${club.slug}`}
            className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a {club.name}
          </Link>
        </div>
      </div>

      <RankingView
        clubId={club.id}
        clubSlug={club.slug}
        clubName={club.name}
        clubLogoUrl={club.logo_url}
        accentColor={CLUB_PRIMARY_COLOR}
        role={membership ? (membership.role as "OWNER" | "ADMIN" | "PLAYER") : "PLAYER"}
        readOnly
        ownClubMemberId={membership?.id ?? null}
        categories={categoryList}
        initialCategory={initialCategory}
        initialRanking={initialRanking}
        initialError={initialError}
      />
    </div>
  );
}
