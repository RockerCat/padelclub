import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { Badge } from "@/components/ui";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { LogOut, Plus, CheckCircle2, ShieldCheck, ChevronDown } from "lucide-react";
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
  };
};

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const showWelcome = welcome === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let memberships: MembershipRow[] = [];
  let lastClubId: string | null = null;
  let accountType: string | null = null;
  let platformAdmin = false;
  let notificationCount = 0;
  let notificationItems: Awaited<ReturnType<typeof getRecentNotifications>> = [];

  if (user) {
    const [membershipsResult, profileResult, isAdmin, unreadCount, recentNotifications] = await Promise.all([
      supabase
        .from("club_members")
        .select("role, clubs!inner(id, name, slug, logo_url)")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("last_club_id, account_type")
        .eq("id", user.id)
        .single(),
      isPlatformAdmin(),
      getUnreadNotificationCount(supabase),
      getRecentNotifications(supabase),
    ]);
    memberships = (membershipsResult.data ?? []) as unknown as MembershipRow[];
    lastClubId = profileResult.data?.last_club_id ?? null;
    accountType = profileResult.data?.account_type ?? null;
    platformAdmin = isAdmin;
    notificationCount = unreadCount;
    notificationItems = recentNotifications;
  }

  const hasClubs = memberships.length > 0;
  const isOwner  = memberships.some((m) => m.role === "OWNER");
  // welcome=1 renders the OWNER "crea tu primer club" onboarding — never
  // shown to an account already known to be PLAYER (account_type is the
  // authoritative, server-side signal; a client-supplied ?welcome=1 alone
  // is never trusted for this), even if it's manually typed into the URL.
  const isWelcomeMode = showWelcome && !!user && !hasClubs && accountType !== "PLAYER";
  // A logged-in account with zero active club memberships is, by
  // construction, never OWNER or ADMIN here (both roles always imply an
  // active club_members row) — it's either an established PLAYER with no
  // current club, or a just-registered account with no account_type yet
  // (see CLAUDE.md → Role Philosophy). platformAdmin (SUPERADMIN) is the
  // one other account shape that can reach !hasClubs, so it's excluded
  // explicitly rather than left to fall through unnoticed.
  const isPlayerEmptyState = !!user && !hasClubs && !platformAdmin;

  // Skip directory fetch when in welcome mode — not needed
  const [directoryClubs, pendingRequestClubIds] = await Promise.all([
    isWelcomeMode
      ? Promise.resolve([] as DirectoryClub[])
      : supabase
          .from("clubs")
          .select("id, name, slug, visibility, description, logo_url, whatsapp, city, state, latitude, longitude")
          .eq("is_active", true)
          .is("archived_at", null)
          .order("name", { ascending: true })
          .then(({ data }) => (data ?? []) as unknown as DirectoryClub[]),
    isWelcomeMode || !user
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
                align="right"
                triggerClassName="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
                triggerContent={
                  <>
                    Registrarme
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Welcome mode: single-focus onboarding ───────────────────────────── */}
      {isWelcomeMode ? (
        <div className="max-w-sm mx-auto px-4 py-20 flex flex-col items-center text-center gap-8">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white mb-2">¡Cuenta creada!</h1>
            <p className="text-sm text-brand-muted leading-relaxed">
              Ahora crea tu primer club para comenzar a operar.
            </p>
          </div>

          <Link
            href="/clubs/create"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:bg-brand-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear mi club
          </Link>
        </div>

      ) : (

        /* ── Normal mode ────────────────────────────────────────────────────── */
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

                        return (
                          <Link
                            key={club.id}
                            href={entryPath}
                            style={{ "--card-primary": CLUB_PRIMARY_COLOR } as React.CSSProperties}
                            className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--card-primary)] hover:bg-[color-mix(in_srgb,var(--card-primary)_6%,transparent)] transition-colors group"
                          >
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
                              <div className="mt-0.5">
                                <Badge
                                  variant={role === "OWNER" ? "primary" : role === "ADMIN" ? "secondary" : "outline"}
                                  size="sm"
                                >
                                  {ROLE_LABELS[role] ?? role}
                                </Badge>
                              </div>
                            </div>

                            <span className="text-xs font-semibold shrink-0 group-hover:underline" style={{ color: CLUB_PRIMARY_COLOR }}>
                              Entrar →
                            </span>
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
      )}

    </div>
  );
}
