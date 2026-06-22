import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClubPublicView, type ViewerContext } from "@/components/clubs/ClubPublicView";
import { getClubPublicPageData } from "@/lib/clubPublicPageData";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props { params: Promise<{ slug: string }> }

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase  = await createClient();
  const { data }  = await supabase.from("clubs").select("name, description")
    .eq("slug", slug).eq("is_active", true).single();
  if (!data) return { title: "Club no encontrado | PadelClub" };
  return { title: `${data.name} | PadelClub`, description: data.description ?? `Conoce ${data.name} en PadelClub.` };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicClubPage({ params }: Props) {
  const { slug } = await params;
  const supabase  = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: clubData } = await supabase
    .from("clubs")
    .select("id, name, slug, description, logo_url, cover_image_url, primary_color, secondary_color, visibility, city, state, country, address, whatsapp, instagram, facebook, youtube, latitude, longitude, gallery_image_urls")
    .eq("slug", slug).eq("is_active", true).single();

  if (!clubData) notFound();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const club = clubData!;

  const [membershipResult, publicData, joinRequestResult] = await Promise.all([
    user
      ? supabase.from("club_members").select("role").eq("club_id", club.id).eq("profile_id", user.id).eq("is_active", true).single()
      : Promise.resolve({ data: null }),
    getClubPublicPageData(supabase, club.id),
    user
      ? supabase.from("club_join_requests").select("id").eq("club_id", club.id).eq("profile_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const membership       = membershipResult.data as { role: string } | null;
  const { courts, schedule, playerCount } = publicData;
  const alreadyRequested = joinRequestResult.data != null;

  const viewerContext: ViewerContext = membership
    ? { kind: "member", role: membership.role }
    : !user
      ? { kind: "visitor" }
      : { kind: "pendingRequest", alreadyRequested };

  const topBar = (
    <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link href="/clubs" className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Explorar clubes
        </Link>
        {!user && (
          <Link href={`/auth/login?next=/clubs/${club.slug}`} className="text-sm text-brand-muted hover:text-white transition-colors">
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
      viewerContext={viewerContext}
      topBar={topBar}
    />
  );
}
