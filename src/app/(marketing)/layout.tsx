import Navbar, { type NavbarAuthState } from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { createClient } from "@/lib/supabase/server";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";
import { resolveClubEntryPath } from "@/lib/utils/navigation";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";

// Session-aware Navbar: same identity/entry-path/notifications sources the
// authenticated app already uses (getSidebarIdentity, resolveClubEntryPath,
// checkProfileIsPlatformAdmin, getUnreadNotificationCount/
// getRecentNotifications — see [club]/layout.tsx and /clubs/page.tsx for the
// same pattern), resolved once here server-side and passed down as a plain
// prop. Navbar itself never re-derives any of this — it only picks which
// CTA set to render based on whether authState is null.
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let authState: NavbarAuthState | null = null;

  if (user) {
    const [identity, entryPath, isPlatformAdmin, notificationCount, notificationItems] = await Promise.all([
      getSidebarIdentity(supabase, user.id, user.email ?? null),
      resolveClubEntryPath(supabase, user.id),
      checkProfileIsPlatformAdmin(supabase, user.id),
      getUnreadNotificationCount(supabase),
      getRecentNotifications(supabase),
    ]);

    authState = {
      name: identity.name,
      // Platform admins land on /platform, same override every other entry
      // point (LoginForm, /clubs) already applies before trusting the
      // plain club-membership resolution below.
      entryPath: isPlatformAdmin ? "/platform" : entryPath,
      notificationCount,
      notificationItems,
    };
  }

  return (
    <>
      <Navbar authState={authState} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
