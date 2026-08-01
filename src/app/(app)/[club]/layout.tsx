import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/layout/AppNav";
import { ClubThemeProvider } from "@/components/layout/ClubThemeProvider";
import { UpdateLastClub } from "@/components/layout/UpdateLastClub";
import Footer from "@/components/layout/Footer";
import { getPendingJoinRequestsCount } from "@/lib/joinRequests";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";
import { getSidebarIdentity } from "@/lib/userIdentity";
import type { ClubRole } from "@/types/database";

interface ClubLayoutProps {
  children: React.ReactNode;
  params: Promise<{ club: string }>;
}

export default async function ClubLayout({ children, params }: ClubLayoutProps) {
  const { club: slug } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[user]", user?.id);

  if (!user) {
    redirect("/auth/login");
  }

  console.log("[club lookup]", slug);

  // A club created via platform_create_pending_club is is_active=true from
  // birth (Entrega de Club — see 20261005000001), so this plain lookup
  // already finds it — no special-cased pending-club branch needed.
  const result = await supabase
    .from("clubs")
    .select("id, name, slug, logo_url, archived_at")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  console.log("[club result]", result);
  console.log("[club data]", result.data);
  console.log("[club error]", result.error);

  const club = result.data;

  if (!club) {
    notFound();
  }

  // Step 2: verify the user is an active member of this club
  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  console.log("[membership]", membership);

  if (!membership) {
    redirect("/unauthorized");
  }

  const role = membership.role as ClubRole;

  // Count total active memberships (for "Cambiar de club") and pending join
  // requests (for the Jugadores nav badge, OWNER/ADMIN only) side by side —
  // both are cheap head-count queries, no row data fetched.
  const [{ count }, pendingJoinRequests, notificationCount, notificationItems, identity] = await Promise.all([
    supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("is_active", true),
    role === "PLAYER" ? Promise.resolve(0) : getPendingJoinRequestsCount(supabase, club.id),
    getUnreadNotificationCount(supabase),
    getRecentNotifications(supabase),
    getSidebarIdentity(supabase, user.id, user.email ?? null),
  ]);

  const membershipCount = count ?? 1;

  return (
    <ClubThemeProvider>
      <UpdateLastClub clubId={club.id} />
      {/* Fila sidebar+contenido — recrea el `md:flex-row` que antes vivía
          en ClubThemeProvider, ahora acotado a este único hijo para que el
          Footer (hermano siguiente, ver abajo) quede fuera de la fila y
          abarque todo el ancho, nunca apretado como tercera columna. */}
      <div className="flex flex-col md:flex-row flex-1">
        <AppNav
          club={club}
          role={role}
          membershipCount={membershipCount}
          pendingJoinRequests={pendingJoinRequests}
          notificationCount={notificationCount}
          notificationItems={notificationItems}
          identity={identity}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {/* OWNER-only: the real enforcement is server-side (every write RPC
              rejects an archived club) — this is just visibility, per CLAUDE.md
              → Notifications & Live-Update Principles' spirit of never hiding
              state behind silence. ADMIN/PLAYER learn about it inline, only
              when they actually attempt a blocked operation. */}
          {role === "OWNER" && club.archived_at && (
            <div className="px-4 md:px-6 pt-4">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
                Este club está archivado. Ya no acepta nuevas reservas, solicitudes de ingreso ni invitaciones. Toda la información histórica se conserva.
              </div>
            </div>
          )}

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
      <Footer />
    </ClubThemeProvider>
  );
}
