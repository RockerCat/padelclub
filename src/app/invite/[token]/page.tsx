import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent, Button } from "@/components/ui";
import { AcceptInviteCard } from "./AcceptInviteCard";

interface InvitePageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  PLAYER: "jugador",
  ADMIN: "administrador",
};

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "El enlace de confirmación expiró o ya no es válido.",
  otp_expired: "El enlace de confirmación expiró.",
};

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-3xl font-black tracking-tight text-white">
              Padel<span className="text-brand-primary">Club</span>
            </span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

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
    role?: string;
    expires_at?: string;
    club_name?: string;
    club_slug?: string;
    club_logo_url?: string | null;
  } | null;

  // Error from Supabase auth callback (access_denied, otp_expired, etc.)
  if (urlError) {
    const message =
      ERROR_MESSAGES[urlError] ??
      "Hubo un problema al confirmar tu cuenta. Intenta de nuevo.";

    return (
      <Layout>
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

  // Token not found or invalid
  if (!info || !info.valid) {
    const reason = !info
      ? "Este link de invitación no existe."
      : info.expired
      ? "Este link de invitación ha expirado."
      : info.max_uses_reached
      ? "Este link ya no está disponible."
      : !info.is_active
      ? "Este link ha sido revocado."
      : "Link de invitación inválido.";

    return (
      <Layout>
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

  const roleLabel = ROLE_LABELS[info.role ?? "PLAYER"] ?? "miembro";
  const clubName = info.club_name ?? "el club";
  const clubSlug = info.club_slug!;

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
        <Layout>
          <Card variant="elevated">
            <CardContent className="pt-8 pb-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-black text-brand-primary">
                    {clubName[0]?.toUpperCase() ?? "C"}
                  </span>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white mb-1">
                    Ya formas parte de {clubName}
                  </h1>
                  <p className="text-sm text-brand-muted">
                    Eres {existingRoleLabel} de este club.
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
      <Layout>
        <AcceptInviteCard
          token={token}
          clubName={clubName}
          roleLabel={roleLabel}
          clubSlug={clubSlug}
        />
      </Layout>
    );
  }

  // Not authenticated
  return (
    <Layout>
      <Card variant="elevated">
        <CardHeader>
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-black text-brand-primary">
                {clubName[0]?.toUpperCase() ?? "C"}
              </span>
            </div>
            <h1 className="text-lg font-bold text-white">Únete a {clubName}</h1>
            <p className="text-sm text-brand-muted mt-1">
              Has sido invitado como {roleLabel}.
            </p>
          </div>
        </CardHeader>
        <CardContent>
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
          <p className="text-xs text-brand-muted text-center mt-4">
            Invitación válida hasta{" "}
            {new Date(info.expires_at!).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </CardContent>
      </Card>
    </Layout>
  );
}
