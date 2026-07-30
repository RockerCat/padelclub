import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/layout/AppNav";
import { ClubThemeProvider } from "@/components/layout/ClubThemeProvider";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { getPendingJoinRequestsCount } from "@/lib/joinRequests";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { resolveActiveMembership } from "@/lib/utils/navigation";
import type { ClubRole } from "@/types/database";

// /profile stays a global, account-level route (URL unchanged — this is a
// Next.js route group, which adds no path segment) but now sits inside
// (app) alongside [club], purely so it can render the SAME AppNav shell
// [club]/layout.tsx already renders — never a second/duplicated sidebar.
// The club shown is resolved via resolveActiveMembership (last_club_id or
// the user's own membership history) for VISUAL/NAVIGATION CONTEXT ONLY —
// it is never passed to the profile page's own data fetching, which stays
// entirely global across every club (see page.tsx / get_my_profile_activity).
// Deliberately does NOT render UpdateLastClub: visiting the global profile
// page must never overwrite which club counts as "last used".
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?next=/profile");

  const [active, notificationCount, notificationItems, identity] = await Promise.all([
    resolveActiveMembership(supabase, user.id),
    getUnreadNotificationCount(supabase),
    getRecentNotifications(supabase),
    getSidebarIdentity(supabase, user.id, user.email ?? null),
  ]);

  // No active, non-archived membership anywhere — a fresh account, or one
  // that left/was removed from every club. Must not fail: falls back to a
  // minimal top bar (same convention already used standalone by /clubs and
  // /notifications, neither of which sits under a club-scoped shell
  // either) instead of the club-scoped AppNav, which has no real club to
  // point to.
  if (!active) {
    return (
      <div className="min-h-screen flex flex-col bg-brand-bg">
        <div className="border-b border-white/10 bg-brand-bg/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
            <Link href="/" className="shrink-0">
              <span className="text-lg font-black tracking-tight text-white whitespace-nowrap">
                <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>
                  Mi
                </span>
                Padel<span className="text-brand-primary">Club</span>
              </span>
            </Link>
            <div className="flex items-center gap-3 shrink-0">
              <NotificationBell initialCount={notificationCount} initialItems={notificationItems} />
              <Link href="/clubs" className="text-sm text-brand-muted hover:text-white transition-colors">
                Mis clubes
              </Link>
            </div>
          </div>
        </div>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    );
  }

  const [{ count }, pendingJoinRequests] = await Promise.all([
    supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("is_active", true),
    active.role === "PLAYER" ? Promise.resolve(0) : getPendingJoinRequestsCount(supabase, active.club.id),
  ]);

  return (
    <ClubThemeProvider>
      <AppNav
        club={active.club}
        role={active.role as ClubRole}
        membershipCount={count ?? 1}
        pendingJoinRequests={pendingJoinRequests}
        notificationCount={notificationCount}
        notificationItems={notificationItems}
        identity={identity}
      />
      <main className={active.role === "PLAYER" ? "flex-1 min-w-0" : "flex-1 min-w-0 pb-28 md:pb-0"}>
        {children}
      </main>
    </ClubThemeProvider>
  );
}
