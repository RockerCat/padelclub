import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { LogOut, Plus } from "lucide-react";
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
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function ClubsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public clubs — readable by anon via clubs_select_active RLS policy
  // Requires migration 005 (visibility column) to be applied
  const { data: rawDirectory } = await supabase
    .from("clubs")
    .select("id, name, slug, description, logo_url, primary_color, secondary_color, whatsapp, city, state")
    .eq("is_active", true)
    .eq("visibility", "public")
    .order("name", { ascending: true });
  const directoryClubs = (rawDirectory ?? []) as unknown as DirectoryClub[];

  // Memberships — only fetched for authenticated users
  let memberships: MembershipRow[] = [];
  let lastClubId: string | null = null;

  if (user) {
    const [membershipsResult, profileResult] = await Promise.all([
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
    ]);
    memberships = (membershipsResult.data ?? []) as unknown as MembershipRow[];
    lastClubId = profileResult.data?.last_club_id ?? null;
  }

  // Sort: last used first, then alphabetical
  const sorted = [...memberships].sort((a, b) => {
    if (a.clubs.id === lastClubId) return -1;
    if (b.clubs.id === lastClubId) return 1;
    return a.clubs.name.localeCompare(b.clubs.name, "es");
  });

  // Build membership map: clubId → MemberInfo (used by ExploreSection to mark member clubs)
  const memberMap: Record<string, MemberInfo> = {};
  for (const { role, clubs: club } of memberships) {
    memberMap[club.id] = { slug: club.slug, role };
  }

  const isOwner = memberships.some((m) => m.role === "OWNER");
  const hasClubs = memberships.length > 0;
  const createClubHref = hasClubs ? "/clubs/create" : "/onboarding";

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Slim top bar */}
      <div className="border-b border-white/10 bg-brand-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <span className="text-lg font-black tracking-tight text-white">
              Padel<span className="text-brand-primary">Club</span>
            </span>
          </Link>

          {user ? (
            <form
              action={async () => {
                "use server";
                const { createClient: createServerClient } = await import(
                  "@/lib/supabase/server"
                );
                const sb = await createServerClient();
                await sb.auth.signOut();
                redirect("/");
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center gap-2 text-sm text-brand-muted hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            </form>
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

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Clubes</h1>
          <p className="text-brand-muted text-sm mt-1">
            Encuentra clubes de pádel o entra a los clubes donde ya estás registrado.
          </p>
        </div>

        <div className="flex flex-col gap-10">
          {/* ── Mis clubes (authenticated only) ── */}
          {user && (
            <section>
              <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
                Mis clubes
              </h2>

              {sorted.length > 0 ? (
                <>
                  <div className="flex flex-col gap-3">
                    {sorted.map(({ role, clubs: club }) => {
                      const entryPath = getClubEntryPath(club.slug, role);
                      const initials = getInitials(club.name);
                      const isLast = club.id === lastClubId;

                      return (
                        <Link
                          key={club.id}
                          href={entryPath}
                          style={
                            { "--card-primary": club.primary_color } as React.CSSProperties
                          }
                          className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-brand-surface border border-white/10 hover:border-[var(--card-primary)] hover:bg-[color-mix(in_srgb,var(--card-primary)_6%,transparent)] transition-colors group"
                        >
                          {/* Logo */}
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
                            style={{
                              backgroundColor: `${club.primary_color}22`,
                              color: club.primary_color,
                            }}
                          >
                            {club.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={club.logo_url}
                                alt={`Logo de ${club.name}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              initials
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white truncate">
                                {club.name}
                              </span>
                              {isLast && (
                                <span className="text-[10px] text-brand-muted bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-md shrink-0">
                                  Último usado
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5">
                              <Badge
                                variant={
                                  role === "OWNER"
                                    ? "primary"
                                    : role === "ADMIN"
                                    ? "secondary"
                                    : "outline"
                                }
                                size="sm"
                              >
                                {ROLE_LABELS[role] ?? role}
                              </Badge>
                            </div>
                          </div>

                          {/* Entrar */}
                          <span
                            className="text-xs font-semibold shrink-0 group-hover:underline"
                            style={{ color: club.primary_color }}
                          >
                            Entrar →
                          </span>
                        </Link>
                      );
                    })}
                  </div>

                  {/* Create another club — OWNER only */}
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
                /* Empty state */
                <div className="rounded-2xl border border-white/10 bg-brand-surface px-5 py-8 text-center">
                  <p className="text-sm font-medium text-white mb-1">
                    Aún no perteneces a ningún club.
                  </p>
                  <p className="text-sm text-brand-muted mb-5">
                    Explora clubes disponibles o crea tu propio club.
                  </p>
                  <Link
                    href={createClubHref}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Crear mi club
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* ── Explorar clubes ── */}
          <ExploreSection
            clubs={directoryClubs}
            memberMap={memberMap}
            isAuthenticated={!!user}
          />
        </div>
      </div>
    </div>
  );
}
