import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { getClubPublicPageData } from "@/lib/clubPublicPageData";
import { getPlayerReservations } from "@/lib/playerReservations";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { ClubHero } from "@/components/clubs/ClubHero";
import { PublicNewsCard } from "@/components/clubs/PublicNewsCard";
import { PlayerHomeActivity } from "./PlayerHomeActivity";
import { ClubInfoSections } from "./ClubInfoSections";

interface PlayerHomePageProps {
  params: Promise<{ club: string }>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// The PLAYER's landing page inside a club (see getClubEntryPath) — reuses
// the exact same data sources as the public page (getClubPublicPageData)
// and the Reservations page (getPlayerReservations), but with its own
// member-first layout: reservations/requests dominate, club info follows.
// Never the public ClubPublicView component itself — no join/login CTAs,
// no public header/nav, this is a member-only surface inside the (app)
// layout (sidebar, notification bell, identity already provided there).

export default async function PlayerHomePage({ params }: PlayerHomePageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select(
      "id, name, slug, description, logo_url, cover_image_url, visibility, city, state, country, address, whatsapp, instagram, facebook, youtube, latitude, longitude, gallery_image_urls"
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!club) notFound();

  const access = await resolveClubAccess(supabase, club.id);
  if (!access.authorized) redirect("/unauthorized");

  // Same rule as the public page: OWNER/ADMIN never land on the member
  // home — straight to their own operational entry point. SUPERADMIN
  // elevated access always resolves to "OWNER", so it lands on the
  // dashboard here too, same as a real OWNER visiting this legacy URL.
  if (access.role !== "PLAYER") {
    redirect(getClubEntryPath(slug, access.role));
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [publicData, { myReservations, myBookings }, identity] = await Promise.all([
    getClubPublicPageData(supabase, club.id),
    getPlayerReservations(supabase, club.id, user.id, todayStr),
    getSidebarIdentity(supabase, user.id, user.email ?? null),
  ]);

  const { courts, schedule, news } = publicData;
  const firstName = identity.name.split(/\s+/)[0];

  return (
    <div className="p-4 md:p-8 max-w-6xl flex flex-col gap-6">
      {/* Encabezado — compact card variant (never the full-bleed public
          hero), no actions slot: this is a member's home, not a landing
          page asking them to join. */}
      <div className="flex flex-col gap-2">
        <ClubHero club={club} variant="card" showSocial={false} />
        <p className="text-sm text-brand-muted px-1">
          Hola, {firstName}. Esto es lo próximo en {club.name}.
        </p>
      </div>

      {/* Reservas y solicitudes — máxima prioridad operativa. */}
      <PlayerHomeActivity
        clubId={club.id}
        clubSlug={slug}
        playerId={user.id}
        myBookings={myBookings}
        myReservations={myReservations}
      />

      {/* Noticias recientes */}
      {news.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Noticias recientes</h2>
            <Link
              href={`/clubs/${slug}/news`}
              className="text-xs font-medium text-brand-muted hover:text-white transition-colors"
            >
              Ver todas las noticias
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {news.map((item) => (
              <PublicNewsCard key={item.id} clubSlug={slug} news={item} />
            ))}
          </div>
        </div>
      )}

      {/* Información del club */}
      <ClubInfoSections club={club} schedule={schedule} courts={courts} />
    </div>
  );
}
