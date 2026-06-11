import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent, Button } from "@/components/ui";
import { ClaimButton } from "./ClaimButton";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  PLAYER: "jugador",
  ADMIN: "administrador",
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  const supabase = await createClient();

  // Preview is publicly accessible via SECURITY DEFINER function
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
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-center mb-8">
            <Link href="/">
              <span className="text-3xl font-black tracking-tight text-white">
                Padel<span className="text-brand-primary">Club</span>
              </span>
            </Link>
          </div>
          <Card variant="elevated">
            <CardContent className="pt-6">
              <p className="text-4xl mb-4">🔒</p>
              <h1 className="text-lg font-bold text-white mb-2">Invitación inválida</h1>
              <p className="text-sm text-brand-muted mb-6">{reason}</p>
              <Link href="/">
                <Button variant="secondary" className="w-full">
                  Ir al inicio
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Check auth state
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roleLabel = ROLE_LABELS[info.role ?? "PLAYER"] ?? "miembro";
  const clubName = info.club_name ?? "el club";

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-3xl font-black tracking-tight text-white">
              Padel<span className="text-brand-primary">Club</span>
            </span>
          </Link>
        </div>

        <Card variant="elevated">
          <CardHeader>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-black text-brand-primary">
                  {clubName[0]?.toUpperCase() ?? "C"}
                </span>
              </div>
              <h1 className="text-lg font-bold text-white">
                Únete a {clubName}
              </h1>
              <p className="text-sm text-brand-muted mt-1">
                Has sido invitado como {roleLabel}.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {user ? (
              // Authenticated: show claim button
              <ClaimButton token={token} />
            ) : (
              // Not authenticated: prompt to sign up or log in
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
            )}

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
      </div>
    </div>
  );
}
