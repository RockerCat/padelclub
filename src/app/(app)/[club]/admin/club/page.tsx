import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { resolveClubHubTab } from "./clubHubTabsConfig";
import { ClubHubTabs } from "./ClubHubTabs";
import { getClubPublicPageData } from "@/lib/clubPublicPageData";
import { DEFAULT_OPERATING_HOURS, type OperatingHour } from "@/lib/operatingHours";
import { getClubDurations } from "@/lib/durations";
import { PublicPageSections } from "../public-page/PublicPageSections";
import { NewsGrid } from "../news/NewsGrid";
import { TeamClient } from "../team/TeamClient";
import { SettingsModules } from "../settings/SettingsModules";
import type { Club, ClubNewsWithAuthor } from "@/types/database";
import type { InviteLinkRow } from "@/components/invites/InviteLinkList";

interface ClubHubPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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

// Hub administrativo "Club" — consolida Perfil público, Noticias, Equipo y
// Configuración en una misma ruta (/[club]/admin/club?tab=) — ver CLAUDE.md,
// bloque de reorganización #2. Cada vista reutiliza tal cual el componente
// que ya implementaba esa capacidad (PublicPageSections/NewsGrid/TeamClient/
// SettingsModules) — nunca una segunda versión — y solo la vista activa
// hace sus propias consultas.
export default async function ClubHubPage({ params, searchParams }: ClubHubPageProps) {
  const { club: slug } = await params;
  const resolvedSearchParams = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!club) notFound();

  // resolveClubAccess also recognizes SUPERADMIN's elevated "Entrar al
  // club" access (never a club_members row) for an active club — the
  // parent layouts already granted it; this page must not re-reject it
  // with its own independent membership check.
  const access = await resolveClubAccess(supabase, club.id);
  if (!access.authorized) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(access.role)) redirect(`/${slug}`);

  const role = access.role as "OWNER" | "ADMIN";
  const activeTab = resolveClubHubTab(
    typeof resolvedSearchParams.tab === "string" ? resolvedSearchParams.tab : undefined,
    role
  );

  let content: React.ReactNode = null;

  if (activeTab === "perfil_publico") {
    const { courts, schedule, playerCount, news } = await getClubPublicPageData(supabase, club.id);
    content = (
      <PublicPageSections
        club={club as Club}
        courts={courts}
        schedule={schedule}
        playerCount={playerCount}
        news={news}
        currentUserRole={role}
      />
    );
  }

  if (activeTab === "noticias") {
    const { data: news } = await supabase
      .from("club_news")
      .select("*, created_by_profile:profiles!club_news_created_by_fkey(full_name)")
      .eq("club_id", club.id)
      .order("published_at", { ascending: false });

    content = (
      <div className="p-6 md:p-10">
        <NewsGrid news={(news ?? []) as ClubNewsWithAuthor[]} clubSlug={slug} clubId={club.id} />
      </div>
    );
  }

  if (activeTab === "equipo") {
    // resolveClubHubTab already clamps ADMIN away from "equipo" — this branch
    // only ever runs for OWNER, but the query keeps the exact same shape
    // team/page.tsx already used.
    const [teamResult, inviteResult] = await Promise.all([
      supabase
        .from("club_members")
        .select("id, club_id, profile_id, role, is_active, joined_at, profiles(full_name, avatar_url, phone)")
        .eq("club_id", club.id)
        .in("role", ["OWNER", "ADMIN"])
        .order("joined_at", { ascending: true }),
      supabase
        .from("invitation_links")
        .select("id, token, uses, max_uses, is_active, created_at")
        .eq("club_id", club.id)
        .eq("role", "ADMIN")
        .order("created_at", { ascending: false }),
    ]);

    const teamMembers = (teamResult.data ?? []) as TeamMemberRow[];
    // is_active matters here specifically for OWNER: after an Entrega de
    // Club claim, the club can briefly have two OWNER rows in history — the
    // deactivated SUPERADMIN placeholder (earlier joined_at) and the real,
    // current OWNER — and .find() without this filter would silently pick
    // the retired placeholder. ADMIN intentionally keeps showing inactive
    // rows below (with their own "Inactivo" badge), so only this line changes.
    const owner = teamMembers.find((m) => m.role === "OWNER" && m.is_active) ?? null;
    const admins = teamMembers.filter((m) => m.role === "ADMIN");
    const invites = (inviteResult.data ?? []) as InviteLinkRow[];

    content = (
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
          invites={invites}
        />
      </div>
    );
  }

  if (activeTab === "configuracion") {
    const { data: dbHours } = await supabase
      .from("club_operating_hours")
      .select("day_of_week, is_open, opens_at, closes_at")
      .eq("club_id", club.id)
      .order("day_of_week");

    const { data: pricingRules } = await supabase
      .from("club_pricing_rules")
      .select(
        "id, club_id, court_id, name, days_of_week, start_time, end_time, display_order, is_active, created_at, updated_at, club_pricing_rule_prices(duration_minutes, price_amount, currency)"
      )
      .eq("club_id", club.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    const { data: pricingCourts } = await supabase
      .from("courts")
      .select("id, name")
      .eq("club_id", club.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const { data: sportCategories } = await supabase
      .from("sport_categories")
      .select("code, sort_order, created_at")
      .order("sort_order", { ascending: true });

    const mergedHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => {
      const found = (dbHours ?? []).find((h) => h.day_of_week === def.day_of_week);
      if (!found) return def;
      return {
        day_of_week: found.day_of_week,
        is_open: found.is_open,
        opens_at: found.opens_at,
        closes_at: found.closes_at,
      };
    });

    content = (
      <div className="p-6 md:p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Configuración del club</h1>
          <p className="text-brand-muted mt-1 text-sm">
            Gestiona la ubicación y operación de tu club.
          </p>
        </div>

        <SettingsModules
          club={club as Club}
          clubSlug={slug}
          initialHours={mergedHours}
          role={role}
          pricingRules={pricingRules ?? []}
          pricingCourts={pricingCourts ?? []}
          allowedDurations={getClubDurations(club.allowed_reservation_durations)}
          sportCategories={sportCategories ?? []}
        />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-white">Club</h1>
        <p className="text-brand-muted mt-1 text-sm">
          La identidad pública, las noticias, el equipo y la configuración de tu club.
        </p>
      </div>

      <ClubHubTabs active={activeTab} role={role} />

      {/* Cada vista trae su propio p-6/md:p-10 (idéntico al de su página
          original) — este margen negativo cancela el padding de este
          contenedor exactamente para que no se dupliquen, sin tener que
          tocar el JSX interno de cada vista. En "Vista previa" (Perfil
          público) esto además deja el preview a ancho completo, igual que
          en la página administrativa original. */}
      <div className="-mx-6 md:-mx-10">{content}</div>
    </div>
  );
}
