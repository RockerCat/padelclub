import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { Badge } from "@/components/ui";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { LogOut, Plus, ShieldCheck } from "lucide-react";
import { ExploreSection } from "./ExploreSection";
import type { DirectoryClub, MemberInfo } from "./ExploreSection";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { RegisterMenu } from "@/components/features/marketing/RegisterMenu";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/notifications";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  PLAYER: "Jugador",
};

type MembershipRow = {
  role: string;
  clubs: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    // Estado operativo de plataforma (SUPERADMIN "Desactivar club") — un
    // concepto completamente separado del estado comercial (nunca
    // club_subscriptions/entitlement). "Mis clubes" sigue mostrando estos
    // clubes a propósito (pantalla informativa), solo cambia su
    // presentación — ver el render de la tarjeta más abajo.
    is_active: boolean;
  };
};

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default async function ClubsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let memberships: MembershipRow[] = [];
  let lastClubId: string | null = null;
  let platformAdmin = false;
  let notificationCount = 0;
  let notificationItems: Awaited<ReturnType<typeof getRecentNotifications>> = [];

  if (user) {
    const [membershipsResult, profileResult, isAdmin, unreadCount, recentNotifications] = await Promise.all([
      supabase
        .from("club_members")
        .select("role, clubs!inner(id, name, slug, logo_url, is_active)")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: true }),
      // last_club_id/account_type have no general SELECT grant since the
      // profiles privacy fix (20261114000002) — get_my_profile() is
      // self-only by construction (derives id from auth.uid()).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- get_my_profile added in 20261114000002, not yet in generated types until `npm run types:generate` runs against a DB with this migration applied.
      (supabase.rpc as any)("get_my_profile"),
      isPlatformAdmin(),
      getUnreadNotificationCount(supabase),
      getRecentNotifications(supabase),
    ]);
    memberships = (membershipsResult.data ?? []) as unknown as MembershipRow[];
    const myProfileRow = profileResult.data?.[0] ?? null;
    lastClubId = myProfileRow?.last_club_id ?? null;
    platformAdmin = isAdmin;
    notificationCount = unreadCount;
    notificationItems = recentNotifications;
  }

  const hasClubs = memberships.length > 0;
  const isOwner  = memberships.some((m) => m.role === "OWNER");
  // A logged-in account with zero active club memberships is, by
  // construction, never OWNER or ADMIN here (both roles always imply an
  // active club_members row) — it's either an established PLAYER with no
  // current club, or a just-registered account with no account_type yet
  // (see CLAUDE.md → Role Philosophy). platformAdmin (SUPERADMIN) is the
  // one other account shape that can reach !hasClubs, so it's excluded
  // explicitly rather than left to fall through unnoticed.
  const isPlayerEmptyState = !!user && !hasClubs && !platformAdmin;

  const [directoryClubs, pendingRequestClubIds] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, slug, visibility, description, logo_url, whatsapp, city, state, latitude, longitude")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("name", { ascending: true })
      .then(({ data }) => (data ?? []) as unknown as DirectoryClub[]),
    !user
      ? Promise.resolve([] as string[])
      : supabase
          .from("club_join_requests")
          .select("club_id")
          .eq("profile_id", user.id)
          .eq("status", "pending")
          .then(({ data }) => (data ?? []).map((row) => row.club_id as string)),
  ]);

  const sorted = [...memberships].sort((a, b) => {
    if (a.clubs.id === lastClubId) return -1;
    if (b.clubs.id === lastClubId) return 1;
    return a.clubs.name.localeCompare(b.clubs.name, "es");
  });

  const memberMap: Record<string, MemberInfo> = {};
  for (const { role, clubs: club } of memberships) {
    memberMap[club.id] = { slug: club.slug, role };
  }

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 bg-brand-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <BrandLogo size="sm" />

          {user ? (
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink-0">
              <NotificationBell initialCount={notificationCount} initialItems={notificationItems} />
              {platformAdmin && (
                <Link
                  href="/platform"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors shrink-0"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Platform Admin</span>
                </Link>
              )}
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
                  Salir
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login"
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-white/15 text-white hover:border-white/30 hover:bg-white/5 transition-colors"
              >
                Iniciar sesión
              </Link>
              <RegisterMenu
                playerOnly
                triggerClassName="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
                triggerContent="Registrarme"
              />
            </div>
          )}
        </div>
      </div>

      <div className="py-8 md:py-12">

            {/* ── Mis clubes (authenticated, with active memberships) ─────── */}
            {user && hasClubs && (
              <section className="max-w-3xl mx-auto px-4 mb-10">
                <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
                  Mis clubes
                </h2>

                <div className="flex flex-col gap-3">
                      {sorted.map(({ role, clubs: club }) => {
                        const entryPath = getClubEntryPath(club.slug, role);
                        const initials  = getInitials(club.name);
                        const isLast    = club.id === lastClubId;
                        // Estado operativo de plataforma (clubs.is_active) —
                        // nunca comercial. Solo cambia presentación: la
                        // tarjeta sigue visible, pero deja de invitar a
                        // entrar (ver el branching Link/div más abajo).
                        const isDeactivated = !club.is_active;

                        const cardBody = (
                          <>
                            <div
                              className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
                              style={{ backgroundColor: `${CLUB_PRIMARY_COLOR}22`, color: CLUB_PRIMARY_COLOR }}
                            >
                              {club.logo_url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={club.logo_url} alt={`Logo de ${club.name}`} className="w-full h-full object-cover" />
                                : initials}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-white truncate min-w-0">{club.name}</span>
                                {isLast && (
                                  <span className="text-[10px] text-brand-muted bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-md shrink-0">
                                    Último usado
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <Badge
                                  variant={role === "OWNER" ? "primary" : role === "ADMIN" ? "secondary" : "outline"}
                                  size="sm"
                                >
                                  {ROLE_LABELS[role] ?? role}
                                </Badge>
                                {isDeactivated && (
                                  <Badge variant="default" size="sm">
                                    Desactivado
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {isDeactivated ? (
                              <span className="text-xs font-medium text-brand-muted shrink-0">
                                Desactivado
                              </span>
                            ) : (
                              <span className="text-xs font-semibold shrink-0 group-hover:underline" style={{ color: CLUB_PRIMARY_COLOR }}>
                                Entrar →
                              </span>
                            )}
                          </>
                        );

                        // Un club desactivado por plataforma se mantiene
                        // visible (esta sección es informativa por diseño)
                        // pero deja de ser un destino navegable: nunca un
                        // <Link>, ligeramente atenuado (opacity), sin hover
                        // de "entrar". El estado depende únicamente de
                        // clubs.is_active — nunca de suscripción/entitlement
                        // comercial (un club activo con suscripción
                        // suspended sigue siendo esta misma tarjeta normal).
                        if (isDeactivated) {
                          return (
                            <div
                              key={club.id}
                              aria-disabled="true"
                              className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-brand-surface border border-white/10 opacity-60 cursor-default"
                            >
                              {cardBody}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={club.id}
                            href={entryPath}
                            style={{ "--card-primary": CLUB_PRIMARY_COLOR } as React.CSSProperties}
                            className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--card-primary)] hover:bg-[color-mix(in_srgb,var(--card-primary)_6%,transparent)] transition-colors group"
                          >
                            {cardBody}
                          </Link>
                        );
                      })}
                    </div>

                    {isOwner && (
                      <div className="mt-3">
                        <Link
                          href="/clubs/create"
                          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-2xl border border-white/10 text-sm font-medium text-brand-muted hover:text-white hover:border-white/20 hover:bg-white/5 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Crear otro club
                        </Link>
                      </div>
                    )}
              </section>
            )}

            {/* ── PLAYER sin membresías: encabezado simple, sin tarjeta ────── */}
            {isPlayerEmptyState && (
              <div className="max-w-3xl mx-auto px-4 mb-6">
                <h1 className="text-lg font-semibold text-white">Bienvenido a MiPadel.club</h1>
              </div>
            )}

            {/* ── Explorar clubes ────────────────────────────────────────────── */}
            <div id="explorar" className="max-w-3xl lg:max-w-6xl mx-auto px-4">
              <ExploreSection
                clubs={directoryClubs}
                memberMap={memberMap}
                pendingRequestClubIds={pendingRequestClubIds}
                isAuthenticated={!!user}
              />
            </div>

      </div>

    </div>
  );
}
