import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RankingView } from "./RankingView";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

interface RankingPageProps {
  params: Promise<{ club: string }>;
}

// Fase 1 módulo deportivo, bloque 6 — primera vista visible del ranking.
// Reutiliza exactamente el patrón de resolución de club/membresía ya usado
// en el resto de las páginas de [club] (home/page.tsx, players/page.tsx).
// Accesible para cualquier miembro activo (PLAYER, ADMIN u OWNER) — el
// layout ya lo verifica, esta página lo re-confirma, mismo doble-check ya
// usado en el resto del proyecto.
export default async function RankingPage({ params }: RankingPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id, slug, name, logo_url, default_player_category")
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

  // Catálogo global, ordenado por sort_order — nunca hardcodeado. Público
  // (GRANT SELECT a anon/authenticated, 20260818000001), lectura directa.
  const { data: categories } = await supabase
    .from("sport_categories")
    .select("code, sort_order, created_at")
    .order("sort_order", { ascending: true });

  const categoryList = categories ?? [];

  // Categoría inicial: (1) la propia del miembro autenticado si tiene
  // sport_state; (2) si no, la predeterminada del club; (3) si tampoco,
  // la primera del catálogo por sort_order. Nunca un valor fijo.
  let initialCategory: string | null = null;

  const { data: ownState } = await supabase.rpc("get_club_member_sport_state", {
    p_club_id: club.id,
    p_club_member_id: membership.id,
  });
  if (ownState && ownState.length > 0) {
    initialCategory = ownState[0].category;
  } else if (club.default_player_category) {
    initialCategory = club.default_player_category;
  } else if (categoryList.length > 0) {
    initialCategory = categoryList[0].code;
  }

  // Ranking inicial resuelto en el servidor para el primer render (evita el
  // parpadeo de loading al entrar) — cambios posteriores de categoría se
  // resuelven en el cliente, sin recargar la página.
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
    <RankingView
      clubId={club.id}
      clubSlug={slug}
      clubName={club.name}
      clubLogoUrl={club.logo_url}
      accentColor={CLUB_PRIMARY_COLOR}
      role={membership.role as "OWNER" | "ADMIN" | "PLAYER"}
      ownClubMemberId={membership.id}
      categories={categoryList}
      initialCategory={initialCategory}
      initialRanking={initialRanking}
      initialError={initialError}
    />
  );
}
