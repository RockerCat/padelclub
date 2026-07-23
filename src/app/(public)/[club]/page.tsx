import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClubPublicView, type ViewerContext } from "@/components/clubs/ClubPublicView";
import { getClubPublicPageData } from "@/lib/clubPublicPageData";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";
import { NotificationBell } from "@/components/layout/NotificationBell";
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

  const [membershipResult, publicData, joinRequestResult, profileResult, notificationCount, notificationItems] = await Promise.all([
    user
      ? supabase.from("club_members").select("role").eq("club_id", club.id).eq("profile_id", user.id).eq("is_active", true).single()
      : Promise.resolve({ data: null }),
    getClubPublicPageData(supabase, club.id),
    user
      ? supabase.from("club_join_requests").select("status").eq("club_id", club.id).eq("profile_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("profiles").select("full_name").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    user ? getUnreadNotificationCount(supabase) : Promise.resolve(0),
    user ? getRecentNotifications(supabase) : Promise.resolve([]),
  ]);

  const membership = membershipResult.data as { role: string } | null;

  // OWNER/ADMIN skip the public page entirely — straight to their
  // operational dashboard. PLAYER members stay: their entry to Reservas is
  // the "Entrar al club" CTA below (a click), never a forced redirect —
  // that's what let an admin's approval mid-visit yank the player away to
  // /reservations without them choosing to go there.
  if (membership && membership.role !== "PLAYER") {
    redirect(getClubEntryPath(slug, membership.role as ClubRole));
  }

  const { courts, schedule, playerCount, news } = publicData;
  const existingStatus = (joinRequestResult.data as { status: "pending" | "approved" | "rejected" } | null)?.status;

  const viewerContext: ViewerContext = !user
    ? { kind: "visitor" }
    : membership
      ? { kind: "member", role: membership.role }
      : {
          kind: "pendingRequest",
          requestStatus: existingStatus === "rejected" ? "rejected" : existingStatus === "pending" ? "pending" : "none",
        };

  // Arrived via "Unirme al club" → signup/login → back here — submit the
  // request automatically instead of requiring a second click. Only when
  // there's genuinely nothing yet (RequestAccessButton's autoSubmit is
  // further gated on requestStatus === "none").
  const autoJoin = intent === "join-club" && !!user;

  const fullName = (profileResult.data as { full_name: string | null } | null)?.full_name;

  const topBar = (
    <div className="border-b border-white/8 bg-brand-bg/90 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="shrink-0">
          <span className="text-lg font-black tracking-tight text-white whitespace-nowrap">
            <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>Padel<span className="text-brand-primary">Club</span>
          </span>
        </Link>

        {user ? (
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink-0">
            {fullName && (
              <span className="hidden sm:inline text-sm text-brand-muted truncate max-w-[10rem]">{fullName}</span>
            )}
            <NotificationBell initialCount={notificationCount} initialItems={notificationItems} />
            <form
              action={async () => {
                "use server";
                const { createClient: createServerClient } = await import("@/lib/supabase/server");
                const sb = await createServerClient();
                await sb.auth.signOut();
                redirect("/");
              }}
              className="shrink-0"
            >
              <button
                type="submit"
                className="inline-flex items-center gap-2 text-sm text-brand-muted hover:text-white transition-colors whitespace-nowrap"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        ) : (
          <Link
            href={`/auth/login?next=${encodeURIComponent(intent ? `/${club.slug}?intent=${intent}` : `/${club.slug}`)}`}
            className="text-sm text-brand-muted hover:text-white transition-colors shrink-0"
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
