import Navbar, { type NavbarAuthState } from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { PlayerShell } from "@/components/layout/PlayerShell";
import { createClient } from "@/lib/supabase/server";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";
import { resolveClubEntryPath } from "@/lib/utils/navigation";
import { getSidebarIdentity } from "@/lib/userIdentity";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";
import { getPlayerShellContext } from "@/lib/playerShell";

// Grupo (player): /mi-padel y /partidos/*. Un jugador (PLAYER o cuenta sin
// account_type) navega con el shell personal "Mi Pádel"; un visitante sin
// sesión — y OWNER/ADMIN/SUPERADMIN, que también pueden ver partidos
// abiertos — conserva el Navbar público de marketing, igual que antes de
// mover estas rutas aquí (la URL no cambió: un route group no agrega
// segmento).
export default async function PlayerGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shell = await getPlayerShellContext(supabase, user);
  if (shell) return <PlayerShell context={shell}>{children}</PlayerShell>;

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
      entryPath: isPlatformAdmin ? "/platform" : entryPath,
      notificationCount,
      notificationItems,
    };
  }

  return (
    <>
      <Navbar authState={authState} />
      {/* Compensa el Navbar fijo (h-16 / lg:h-20). */}
      <main className="flex-1 pt-16 lg:pt-20">{children}</main>
      <Footer />
    </>
  );
}
