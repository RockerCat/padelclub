import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MembersClient } from "./MembersClient";
import { JoinRequestsSection } from "./JoinRequestsSection";
import type { JoinRequestRow } from "./JoinRequestsSection";
import { getClubMatchesPlayedByMember, getClubMemberSportState } from "./actions";
import { resolvePlayersStatusFilter, resolvePlayersCategoryFilter } from "./playersFiltersConfig";

interface PlayersPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PlayersPage({ params, searchParams }: PlayersPageProps) {
  const { club: slug } = await params;
  const resolvedSearchParams = await searchParams;
  const statusFilter = resolvePlayersStatusFilter(
    typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : undefined
  );

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

  // Load PLAYER-role members only — status filtered at the query level
  // (never fetched whole and hidden with CSS) whenever it actually narrows
  // the result; "all" intentionally omits the .eq so both states come back
  // in one query rather than two.
  let membersQuery = supabase
    .from("club_members")
    .select("id, club_id, profile_id, role, is_active, joined_at, category, profiles(full_name, avatar_url, phone)")
    .eq("club_id", club.id)
    .eq("role", "PLAYER");
  if (statusFilter !== "all") {
    membersQuery = membersQuery.eq("is_active", statusFilter === "active");
  }
  const { data: members } = await membersQuery.order("joined_at", { ascending: false });

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

  const categoryList = sportCategories ?? [];
  const categoryFilter = resolvePlayersCategoryFilter(
    typeof resolvedSearchParams.category === "string" ? resolvedSearchParams.category : undefined,
    categoryList.map((c) => c.code)
  );

  // Categoría deportiva + posición vigente por jugador, para las tarjetas de
  // la grilla — reutiliza exactamente get_club_category_ranking_view, el
  // mismo RPC ya autorizado que usa /[club]/ranking (20260824000001), nunca
  // una consulta directa a club_member_sport_state/club_ranking_cycles (esas
  // tablas nacen cerradas por RLS, sin GRANT a authenticated). Se llama una
  // vez por categoría del catálogo (acotado, ~7 como mucho) en paralelo, no
  // una vez por jugador — evita el N+1 sin duplicar ni recalcular el
  // ranking. Un jugador sin estado deportivo aprovisionado simplemente no
  // aparece en ninguna de estas filas.
  // "Partidos" de la tarjeta — misma regla exacta de getMatchesPlayedCount
  // (MemberModal), resuelta una vez para todo el club (2 consultas totales)
  // en paralelo con lo de arriba, nunca una vez por jugador.
  const [rankingByCategory, matchesPlayedByMember] = await Promise.all([
    Promise.all(
      categoryList.map((c) =>
        supabase.rpc("get_club_category_ranking_view", { p_club_id: club.id, p_category: c.code })
      )
    ),
    getClubMatchesPlayedByMember(club.id),
  ]);

  const sportStateByMember: Record<string, { category: string; position: number | null; points: number | null }> = {};
  for (const { data: rankingRows, error: rankingError } of rankingByCategory) {
    if (rankingError || !rankingRows) continue;
    for (const row of rankingRows) {
      sportStateByMember[row.club_member_id] = {
        category: row.category,
        position: row.ranking_position,
        points: row.current_points,
      };
    }
  }

  const fetchedMembers = (members ?? []) as Parameters<typeof MembersClient>[0]["members"];

  // get_club_category_ranking_view only ever lists active PLAYER members
  // (see CLAUDE.md → Sport / Ranking Module Principles) — an inactive
  // member's current category is real and preserved, just invisible to
  // that RPC by design. Only when inactive members can actually appear in
  // this view (status = inactive/all) do we resolve their category too,
  // reusing the existing per-member getClubMemberSportState server action
  // (the same one MemberModal already calls) — bounded to just the
  // inactive members on this page, never the whole club, and skipped
  // entirely on the default "Activos" view.
  if (statusFilter !== "active") {
    const inactiveMembers = fetchedMembers.filter((m) => !m.is_active && !sportStateByMember[m.id]);
    if (inactiveMembers.length > 0) {
      const inactiveStates = await Promise.all(
        inactiveMembers.map((m) => getClubMemberSportState(club.id, m.id))
      );
      inactiveMembers.forEach((m, i) => {
        const state = inactiveStates[i];
        if (state.category) {
          // No ranking position — inactive members are never part of a
          // live ranking cycle listing, so there is nothing honest to show
          // beyond the category itself; card/modal already render a
          // missing position as "—". currentPoints is still real (the
          // ledger total doesn't disappear on deactivation), so it's kept.
          sportStateByMember[m.id] = { category: state.category, position: null, points: state.currentPoints };
        }
      });
    }
  }

  // Categoría filtrada server-side reutilizando el mismo mapa anterior —
  // nunca una consulta nueva, nunca se oculta con CSS.
  const memberList =
    categoryFilter === "all"
      ? fetchedMembers
      : fetchedMembers.filter((m) => sportStateByMember[m.id]?.category === categoryFilter);

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
        sportCategories={categoryList}
        sportStateByMember={sportStateByMember}
        matchesPlayedByMember={matchesPlayedByMember}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
      />

      {/* Solicitudes de ingreso — historial completo (aprobadas/rechazadas
          agrupadas en un acordeón cerrado por defecto, pendientes siempre
          visibles) — JoinRequestsSection decide qué acciones mostrar según
          el status de cada fila. "Compartir club" vive ahora en Club →
          Perfil público (ver PublicPreviewCard), no aquí. */}
      {requests.length > 0 && (
        <div className="mt-10">
          <JoinRequestsSection clubId={club.id} clubSlug={slug} requests={requests} />
        </div>
      )}
    </div>
  );
}
