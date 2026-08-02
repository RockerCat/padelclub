import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/layout/AppNav";
import { ClubThemeProvider } from "@/components/layout/ClubThemeProvider";
import { UpdateLastClub } from "@/components/layout/UpdateLastClub";
import Footer from "@/components/layout/Footer";
import { getPendingJoinRequestsCount } from "@/lib/joinRequests";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { isClubRole } from "@/types/domain";
import { ClubDeactivatedScreen } from "@/components/layout/ClubDeactivatedScreen";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";
import { SuperadminAccessBanner } from "@/components/layout/SuperadminAccessBanner";

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
  //
  // No .eq("is_active", true) here on purpose: an inactive club (SUPERADMIN
  // "Desactivar club") must still resolve for its own OWNER/ADMIN/PLAYER so
  // they can be shown ClubDeactivatedScreen below, instead of a plain
  // notFound() indistinguishable from a wrong/nonexistent slug. RLS's
  // clubs_select_own_member policy already lets an existing member read
  // their own club row regardless of is_active — a non-member still gets
  // zero rows either way, so this is not a new information leak.
  const result = await supabase
    .from("clubs")
    .select("id, name, slug, logo_url, archived_at, is_active")
    .eq("slug", slug)
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

  let role: "OWNER" | "ADMIN" | "PLAYER";
  let isSuperadminAccess = false;

  if (membership) {
    // club_members.role is DB-enforced to exactly these three values (see
    // isClubRole) but that isn't visible to the generated Row type —
    // narrow explicitly instead of an `as` cast that wouldn't actually
    // narrow anything.
    if (!isClubRole(membership.role)) {
      redirect("/unauthorized");
    }
    role = membership.role;
  } else {
    // SUPERADMIN "Entrar al club" — elevated, non-persistent OWNER-
    // equivalent access to an ACTIVE club, never a club_members row.
    // Re-derived fresh on every request from profiles.is_platform_admin +
    // club.is_active — never cached, never a cookie/session flag. Mirrors
    // the same check src/lib/clubAccess.ts (resolveClubAccess) uses for
    // every admin server action; see
    // supabase/migrations/20261008000001_superadmin_club_access.sql for
    // the matching, narrowly-scoped SQL-side additive policies/RPC
    // branches this depends on.
    const isPlatformAdmin = await checkProfileIsPlatformAdmin(supabase, user.id);
    if (!isPlatformAdmin || !club.is_active) {
      redirect("/unauthorized");
    }
    role = "OWNER";
    isSuperadminAccess = true;
  }

  // SUPERADMIN "Desactivar club" — identical screen for OWNER/ADMIN/PLAYER,
  // never a 404 (the club and the caller's membership both genuinely
  // exist). Returned before the Promise.all below so a deactivated club
  // never pays for join-request/notification/identity queries for a
  // screen that's about to replace the whole shell. No {children} here —
  // this is what actually stops every nested page.tsx under [club]/ from
  // ever running its own (redundant) is_active check.
  if (!club.is_active) {
    return <ClubDeactivatedScreen />;
  }

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
          isSuperadminAccess={isSuperadminAccess}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {isSuperadminAccess && (
            <div className="px-4 md:px-6 pt-4">
              <SuperadminAccessBanner clubId={club.id} />
            </div>
          )}

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
