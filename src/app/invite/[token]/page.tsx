import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, Button } from "@/components/ui";
import { AcceptInviteCard } from "./AcceptInviteCard";
import { CLUB_PRIMARY_COLOR, CLUB_SECONDARY_COLOR } from "@/lib/constants/clubTheme";

interface InvitePageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}

export type ClubBranding = {
  clubName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  roleLabel: string;
};

const ROLE_LABELS: Record<string, string> = {
  PLAYER: "jugador",
  ADMIN: "administrador",
};

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "El enlace de confirmación expiró o ya no es válido.",
  otp_expired: "El enlace de confirmación expiró.",
};

// ─── Club logo mark ──────────────────────────────────────────────────────────

function ClubLogoMark({
  logoUrl,
  name,
  primaryColor,
}: {
  logoUrl: string | null;
  name: string;
  primaryColor: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="w-16 h-16 rounded-2xl object-cover border border-white/10"
      />
    );
  }
  return (
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black"
      style={{
        backgroundColor: `color-mix(in srgb, ${primaryColor} 15%, transparent)`,
        color: primaryColor,
        border: `1px solid color-mix(in srgb, ${primaryColor} 20%, transparent)`,
      }}
    >
      {name[0]?.toUpperCase() ?? "C"}
    </div>
  );
}

// ─── Page layout ─────────────────────────────────────────────────────────────

function Layout({
  children,
  branding,
}: {
  children: React.ReactNode;
  branding: ClubBranding | null;
}) {
  return (
    <div
      className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-12"
      style={
        branding
          ? ({
              "--color-brand-primary": branding.primaryColor,
              "--color-brand-secondary": branding.secondaryColor,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="w-full max-w-sm">
        {branding ? (
          <div className="flex flex-col items-center mb-8 gap-3">
            <ClubLogoMark
              logoUrl={branding.logoUrl}
              name={branding.clubName}
              primaryColor={branding.primaryColor}
            />
            <h2 className="text-xl font-bold text-white">{branding.clubName}</h2>
          </div>
        ) : (
          <div className="text-center mb-8">
            <Link href="/">
              <span className="text-3xl font-black tracking-tight text-white">
                <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>Padel<span className="text-brand-primary">Club</span>
              </span>
            </Link>
          </div>
        )}

        {children}

        {branding && (
          <p className="text-xs text-brand-muted/40 text-center mt-6">
            Powered by MiPadelClub
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { token } = await params;
  const { error: urlError } = await searchParams;

  const supabase = await createClient();

  const { data: preview } = await supabase.rpc("get_invitation_preview", {
    p_token: token,
  });

  const info = preview as {
    valid: boolean;
    is_active?: boolean;
    expired?: boolean;
    max_uses_reached?: boolean;
    archived?: boolean;
    role?: string;
    expires_at?: string;
    club_name?: string;
    club_slug?: string;
    club_logo_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
  } | null;

  // Extract branding whenever we have it (valid or not — club identity doesn't change)
  const branding: ClubBranding | null =
    info?.club_name
      ? {
          clubName: info.club_name,
          logoUrl: info.club_logo_url ?? null,
          primaryColor: CLUB_PRIMARY_COLOR,
          secondaryColor: CLUB_SECONDARY_COLOR,
          roleLabel: ROLE_LABELS[info.role ?? "PLAYER"] ?? "miembro",
        }
      : null;

  // ── Error from Supabase auth callback ─────────────────────────────────────
  if (urlError) {
    const message =
      CALLBACK_ERROR_MESSAGES[urlError] ??
      "Hubo un problema al confirmar tu cuenta. Intenta de nuevo.";

    return (
      <Layout branding={branding}>
        <Card variant="elevated">
          <CardContent className="pt-6">
            <p className="text-4xl mb-4 text-center">⚠️</p>
            <h1 className="text-lg font-bold text-white mb-2 text-center">
              Enlace de confirmación inválido
            </h1>
            <p className="text-sm text-brand-muted mb-6 text-center">{message}</p>
            <div className="flex flex-col gap-3">
              {info?.valid && (
                <Link href={`/auth/signup?invite=${token}`}>
                  <Button size="lg" className="w-full">
                    Crear cuenta de nuevo
                  </Button>
                </Link>
              )}
              <Link href="/">
                <Button variant="secondary" className="w-full">
                  Ir al inicio
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  // ── Invalid / expired / revoked token ─────────────────────────────────────
  if (!info || !info.valid) {
    const reason = !info
      ? "Este link de invitación no existe."
      : info.expired
      ? "Este link de invitación ha expirado."
      : info.max_uses_reached
      ? "Este link ya no está disponible."
      : info.archived
      ? "Este club se encuentra archivado."
      : !info.is_active
      ? "Este link ha sido revocado."
      : "Link de invitación inválido.";

    return (
      <Layout branding={branding}>
        <Card variant="elevated">
          <CardContent className="pt-6">
            <p className="text-4xl mb-4 text-center">🔒</p>
            <h1 className="text-lg font-bold text-white mb-2 text-center">
              Invitación inválida
            </h1>
            <p className="text-sm text-brand-muted mb-6 text-center">{reason}</p>
            <Link href="/">
              <Button variant="secondary" className="w-full">
                Ir al inicio
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const roleLabel = branding?.roleLabel ?? ROLE_LABELS[info.role ?? "PLAYER"] ?? "miembro";
  const clubSlug = info.club_slug!;
  const clubName = info.club_name ?? "el club";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Authenticated ──────────────────────────────────────────────────────────
  if (user) {
    // Check if already a member of this club
    const { data: memberships } = await supabase
      .from("club_members")
      .select("role, clubs!inner(slug)")
      .eq("profile_id", user.id)
      .eq("is_active", true);

    const existing = (memberships ?? []).find(
      (m) => (m.clubs as { slug: string } | null)?.slug === clubSlug
    );

    if (existing) {
      const existingRoleLabel = ROLE_LABELS[existing.role] ?? "miembro";
      return (
        <Layout branding={branding}>
          <Card variant="elevated">
            <CardContent className="pt-8 pb-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white mb-1">
                    Ya formas parte de este club
                  </h1>
                  <p className="text-sm text-brand-muted">
                    Eres {existingRoleLabel}.
                  </p>
                </div>
                <Link href={`/${clubSlug}`} className="w-full">
                  <Button size="lg" className="w-full">
                    Ir al club
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </Layout>
      );
    }

    // Not yet a member — show accept card
    return (
      <Layout branding={branding}>
        <AcceptInviteCard
          token={token}
          clubName={clubName}
          roleLabel={roleLabel}
          clubSlug={clubSlug}
        />
      </Layout>
    );
  }

  // ── Not authenticated ──────────────────────────────────────────────────────
  return (
    <Layout branding={branding}>
      <Card variant="elevated">
        <CardContent className="pt-6">
          <p className="text-sm text-brand-muted text-center mb-5">
            Has sido invitado como{" "}
            <span className="text-white font-medium">{roleLabel}</span>.
          </p>
          <div className="flex flex-col gap-3">
            <Link href={`/auth/signup?invite=${token}`}>
              <Button size="lg" className="w-full">
                Crear cuenta para unirme
              </Button>
            </Link>
            <Link href={`/auth/login?next=/invite/${token}`}>
              <Button size="lg" variant="secondary" className="w-full">
                Ya tengo cuenta
              </Button>
            </Link>
          </div>
          {/* Player invitations are single-use and non-expiring (a far-future
              sentinel expires_at is used to satisfy the NOT NULL column) —
              showing that date would be meaningless, so only admin invites
              (which still carry a real 7-day expiry) display this line. */}
          {info.role === "ADMIN" && (
            <p className="text-xs text-brand-muted text-center mt-5">
              Invitación válida hasta{" "}
              {new Date(info.expires_at!).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
