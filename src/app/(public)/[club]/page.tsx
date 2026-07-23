import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClubPublicView, type ViewerContext } from "@/components/clubs/ClubPublicView";
import { getClubPublicPageData } from "@/lib/clubPublicPageData";
import { getClubEntryPath } from "@/lib/utils/navigation";
import type { ClubRole } from "@/types/database";

interface Props {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ intent?: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { club: slug } = await params;
  const supabase  = await createClient();
  const { data }  = await supabase.from("clubs").select("name, description")
    .eq("slug", slug).eq("is_active", true).single();
  if (!data) return { title: "Club no encontrado | MiPadelClub" };
  return { title: `${data.name} | MiPadelClub`, description: data.description ?? `Conoce ${data.name} en MiPadelClub.` };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Lives outside the (app) route group on purpose: (app)/layout.tsx gates
// every nested route behind auth, but this exact path — /[club], the club's
// public link — must be visible to anonymous visitors too. A member who
// hits their own club's bare URL still gets redirected straight to their
// dashboard/entry path below, same as the old (app)/[club]/page.tsx this
// replaces (deleted — this is not a parallel implementation, it's the same
// page moved to where it can also serve non-members).

export default async function ClubRootPage({ params, searchParams }: Props) {
  const { club: slug } = await params;
  const { intent } = await searchParams;
  const supabase  = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: clubData } = await supabase
    .from("clubs")
    .select("id, name, slug, description, logo_url, cover_image_url, primary_color, secondary_color, visibility, city, state, country, address, whatsapp, instagram, facebook, youtube, latitude, longitude, gallery_image_urls")
    .eq("slug", slug).eq("is_active", true).single();

  if (!clubData) notFound();
  const club = clubData;

  const [membershipResult, publicData, joinRequestResult] = await Promise.all([
    user
      ? supabase.from("club_members").select("role").eq("club_id", club.id).eq("profile_id", user.id).eq("is_active", true).single()
      : Promise.resolve({ data: null }),
    getClubPublicPageData(supabase, club.id),
    user
      ? supabase.from("club_join_requests").select("status").eq("club_id", club.id).eq("profile_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const membership = membershipResult.data as { role: string } | null;

  // Members skip the public page entirely — straight to their dashboard.
  if (membership) {
    redirect(getClubEntryPath(slug, membership.role as ClubRole));
  }

  const { courts, schedule, playerCount, news } = publicData;
  const existingStatus = (joinRequestResult.data as { status: "pending" | "approved" | "rejected" } | null)?.status;

  const viewerContext: ViewerContext = !user
    ? { kind: "visitor" }
    : {
        kind: "pendingRequest",
        requestStatus: existingStatus === "rejected" ? "rejected" : existingStatus === "pending" ? "pending" : "none",
      };

  // Arrived via "Unirme al club" → signup/login → back here — submit the
  // request automatically instead of requiring a second click. Only when
  // there's genuinely nothing yet (RequestAccessButton's autoSubmit is
  // further gated on requestStatus === "none").
  const autoJoin = intent === "join-club" && !!user;

  const topBar = (
    <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link href="/clubs" className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Explorar clubes
        </Link>
        {!user && (
          <Link
            href={`/auth/login?next=${encodeURIComponent(intent ? `/${club.slug}?intent=${intent}` : `/${club.slug}`)}`}
            className="text-sm text-brand-muted hover:text-white transition-colors"
          >
            Iniciar sesión
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <ClubPublicView
      club={club}
      courts={courts}
      schedule={schedule}
      playerCount={playerCount}
      news={news}
      viewerContext={viewerContext}
      autoJoin={autoJoin}
      topBar={topBar}
    />
  );
}
