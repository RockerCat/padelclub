import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { LogOut, Plus, Users, Home } from "lucide-react";
import { JoinClubButton } from "./JoinClubButton";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  PLAYER: "Jugador",
};

type ClubMembershipRow = {
  role: string;
  clubs: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
  };
};

type PublicClubRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  member_count: number;
  court_count: number;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function ClubSelectorPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [membershipsResult, publicClubsResult] = await Promise.all([
    supabase
      .from("club_members")
      .select("role, clubs!inner(id, name, slug, logo_url, primary_color)")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("joined_at", { ascending: true }),
    supabase.rpc("get_public_clubs"),
  ]);

  const list = (membershipsResult.data ?? []) as ClubMembershipRow[];
  const publicClubs = (publicClubsResult.data ?? []) as PublicClubRow[];

  // No joined clubs and nothing to explore → create first club
  if (list.length === 0 && publicClubs.length === 0) {
    redirect("/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("last_club_id")
    .eq("id", user.id)
    .single();

  const lastClubId = profile?.last_club_id ?? null;

  const sorted = [...list].sort((a, b) => {
    const aIsLast = a.clubs.id === lastClubId ? -1 : 0;
    const bIsLast = b.clubs.id === lastClubId ? -1 : 0;
    if (aIsLast !== bIsLast) return aIsLast - bIsLast;
    return a.clubs.name.localeCompare(b.clubs.name, "es");
  });

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center px-4 py-12">
      {/* Logo */}
      <div className="text-center mb-10">
        <Link href="/">
          <span className="text-3xl font-black tracking-tight text-white">
            Padel<span className="text-brand-primary">Club</span>
          </span>
        </Link>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-8">
        {/* ── Mis clubes ── */}
        {sorted.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
              Mis clubes
            </h2>
            <div className="flex flex-col gap-3">
              {sorted.map(({ role, clubs: club }) => {
                const entryPath = getClubEntryPath(club.slug, role);
                const initials = getInitials(club.name);
                const isLast = club.id === lastClubId;

                return (
                  <Link
                    key={club.id}
                    href={entryPath}
                    style={{ "--card-primary": club.primary_color } as React.CSSProperties}
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
          </section>
        )}

        {/* ── Explorar clubes ── */}
        {publicClubs.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
              Explorar clubes
            </h2>
            <div className="flex flex-col gap-3">
              {publicClubs.map((club) => {
                const initials = getInitials(club.name);

                return (
                  <div
                    key={club.id}
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-brand-surface border border-white/10"
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
                      <p className="text-sm font-semibold text-white truncate">
                        {club.name}
                      </p>
                      {club.description && (
                        <p className="text-xs text-brand-muted mt-0.5 line-clamp-1">
                          {club.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-[11px] text-brand-muted">
                          <Users className="w-3 h-3" />
                          {club.member_count}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-brand-muted">
                          <Home className="w-3 h-3" />
                          {club.court_count}
                        </span>
                      </div>
                    </div>

                    {/* Join */}
                    <JoinClubButton
                      clubId={club.id}
                      primaryColor={club.primary_color}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Create club */}
        <div>
          <Link
            href="/clubs/create"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-2xl border border-white/10 text-sm font-medium text-brand-muted hover:text-white hover:border-white/20 hover:bg-white/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear un club
          </Link>
        </div>

        {/* Sign out */}
        <div className="flex justify-center">
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
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
