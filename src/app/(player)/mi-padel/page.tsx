import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfileRow, isPlayerExperienceProfile, PLAYER_HOME_PATH } from "@/lib/playerShell";
import { resolveClubEntryPath } from "@/lib/utils/navigation";
import { loadPlayerHome } from "./loadPlayerHome";
import { MiPadelView } from "./MiPadelView";

export const metadata: Metadata = { title: "Mi Pádel | Mi Pádel Club" };

// "Mi Pádel" — espacio global del jugador, independiente de cualquier club
// (CLAUDE.md → Player Home Principles). Destino inicial de toda cuenta que
// actúa como jugador (cero, uno o varios clubes). OWNER/ADMIN/SUPERADMIN
// nunca se quedan aquí: se redirigen a su destino administrativo.
export default async function MiPadelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(PLAYER_HOME_PATH)}`);

  const profile = await getMyProfileRow(supabase);
  if (!isPlayerExperienceProfile(profile)) {
    if (profile?.is_platform_admin || profile?.account_type === "SUPERADMIN") redirect("/platform");
    const destination = await resolveClubEntryPath(supabase, user.id);
    // Nunca un loop: si la resolución no tiene otro destino, /clubs.
    redirect(destination === PLAYER_HOME_PATH ? "/clubs" : destination);
  }

  const data = await loadPlayerHome(supabase, user.id);
  const name = profile?.full_name?.trim() || user.email || "Jugador";

  return <MiPadelView data={data} userId={user.id} name={name} avatarUrl={profile?.avatar_url ?? null} />;
}
