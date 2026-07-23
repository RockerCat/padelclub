import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { Badge } from "@/components/ui";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { LogOut, Plus, Compass, CheckCircle2, ShieldCheck } from "lucide-react";
import { ExploreSection } from "./ExploreSection";
import type { DirectoryClub, MemberInfo } from "./ExploreSection";

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
    primary_color: string;
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
  let platformAdmin = false;

  if (user) {
    const [membershipsResult, profileResult, isAdmin] = await Promise.all([
      supabase
        .from("club_members")
        .select("role, clubs!inner(id, name, slug, logo_url, primary_color)")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("last_club_id")
        .eq("id", user.id)
        .single(),
      isPlatformAdmin(),
    ]);
    memberships = (membershipsResult.data ?? []) as unknown as MembershipRow[];
    lastClubId = profileResult.data?.last_club_id ?? null;
    platformAdmin = isAdmin;
  }

  const hasClubs      = memberships.length > 0;
  const isOwner       = memberships.some((m) => m.role === "OWNER");
  const isWelcomeMode = showWelcome && !!user && !hasClubs;

  // Skip directory fetch when in welcome mode — not needed
  const directoryClubs: DirectoryClub[] = isWelcomeMode ? [] : await supabase
    .from("clubs")
    .select("id, name, slug, visibility, description, logo_url, primary_color, secondary_color, whatsapp, city, state")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .then(({ data }) => (data ?? []) as unknown as DirectoryClub[]);

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
          <Link href="/" className="shrink-0">
            <span className="text-lg font-black tracking-tight text-white whitespace-nowrap">
              <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>Padel<span className="text-brand-primary">Club</span>
            </span>
          </Link>

          {user ? (
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink-0">
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
              <Link
                href="/auth/signup"
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
              >
                Registrarse
              </Link>
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
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-col gap-10">

            {/* ── Mis clubes (authenticated only) ─────────────────────────── */}
            {user && (
              <section>
                <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
                  Mis clubes
                </h2>

                {hasClubs ? (
                  <>
                    <div className="flex flex-col gap-3">
                      {sorted.map(({ role, clubs: club }) => {
                        const entryPath = getClubEntryPath(club.slug, role);
                        const initials  = getInitials(club.name);
                        const isLast    = club.id === lastClubId;

                        return (
                          <Link
                            key={club.id}
                            href={entryPath}
                            style={{ "--card-primary": club.primary_color } as React.CSSProperties}
                            className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--card-primary)] hover:bg-[color-mix(in_srgb,var(--card-primary)_6%,transparent)] transition-colors group"
                          >
                            <div
                              className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
                              style={{ backgroundColor: `${club.primary_color}22`, color: club.primary_color }}
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

                            <span className="text-xs font-semibold shrink-0 group-hover:underline" style={{ color: club.primary_color }}>
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
                  </>
                ) : (
                  /* ── Empty state (no clubs, no welcome mode) ── */
                  <div className="rounded-2xl border border-white/10 bg-brand-surface px-6 py-10 flex flex-col items-center text-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/10 flex items-center justify-center">
                      <Compass className="w-7 h-7 text-brand-muted/40" />
                    </div>

                    <div>
                      <p className="text-base font-semibold text-white mb-1.5">Bienvenido a MiPadelClub</p>
                      <p className="text-sm text-brand-muted">Todavía no perteneces a ningún club.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                      <a
                        href="#explorar"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-white/20 text-white hover:border-white/40 hover:bg-white/5 transition-colors"
                      >
                        <Compass className="w-4 h-4" />
                        Explorar clubes
                      </a>
                      <Link
                        href="/clubs/create"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Crear mi club
                      </Link>
                    </div>

                    <div className="text-xs text-brand-muted/50 leading-relaxed max-w-xs">
                      <span className="text-brand-muted/70 font-medium">Explorar:</span> encuentra un club donde jugar pádel.{" "}
                      <span className="text-brand-muted/70 font-medium">Crear:</span> registra y gestiona tu propio club.
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ── Explorar clubes ────────────────────────────────────────────── */}
            <div id="explorar">
              <ExploreSection
                clubs={directoryClubs}
                memberMap={memberMap}
                isAuthenticated={!!user}
              />
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
