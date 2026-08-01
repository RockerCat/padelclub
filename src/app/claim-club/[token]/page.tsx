import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, Button } from "@/components/ui";
import { hashClaimToken } from "@/lib/clubClaim";
import { AcceptClaimCard } from "./AcceptClaimCard";

interface ClaimClubPageProps {
  params: Promise<{ token: string }>;
}

type ClaimPreview = {
  found: boolean;
  status?: "pending" | "claimed" | "revoked" | "not_found";
  club_name?: string;
  club_slug?: string;
  club_logo_url?: string | null;
};

function ClubLogoMark({ logoUrl, name }: { logoUrl: string | null | undefined; name: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={name} className="w-16 h-16 rounded-2xl object-cover border border-white/10" />
    );
  }
  return (
    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black bg-brand-primary/15 text-brand-primary border border-brand-primary/20">
      {name[0]?.toUpperCase() ?? "C"}
    </div>
  );
}

function Layout({ children, clubName, logoUrl }: { children: React.ReactNode; clubName?: string; logoUrl?: string | null }) {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {clubName ? (
          <div className="flex flex-col items-center mb-8 gap-3">
            <ClubLogoMark logoUrl={logoUrl} name={clubName} />
            <h2 className="text-xl font-bold text-white">{clubName}</h2>
          </div>
        ) : (
          <div className="text-center mb-8">
            <Link href="/">
              <span className="text-3xl font-black tracking-tight text-white">
                <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>
                Padel<span className="text-brand-primary">Club</span>
              </span>
            </Link>
          </div>
        )}
        {children}
        {clubName && (
          <p className="text-xs text-brand-muted/40 text-center mt-6">Powered by MiPadelClub</p>
        )}
      </div>
    </div>
  );
}

const INVALID_REASON: Record<string, string> = {
  not_found: "Este enlace de entrega no existe.",
  claimed: "Este club ya fue reclamado por su propietario.",
  revoked: "Este enlace de entrega ha sido revocado.",
};

export default async function ClaimClubPage({ params }: ClaimClubPageProps) {
  const { token } = await params;
  const tokenHash = hashClaimToken(token);

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_club_claim_preview", { p_token_hash: tokenHash });
  const preview = data as ClaimPreview | null;

  // Not found, claimed, or revoked — every reason is a dead end, not
  // something an authenticated action on this page can fix.
  if (!preview || !preview.found || preview.status !== "pending") {
    const reason = INVALID_REASON[preview?.status ?? "not_found"] ?? "Este enlace de entrega no es válido.";
    return (
      <Layout clubName={preview?.club_name} logoUrl={preview?.club_logo_url}>
        <Card variant="elevated">
          <CardContent className="pt-6">
            <p className="text-4xl mb-4 text-center">🔒</p>
            <h1 className="text-lg font-bold text-white mb-2 text-center">Enlace no disponible</h1>
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

  const clubName = preview.club_name ?? "tu club";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Authenticated — show the accept card directly ──────────────────────
  if (user) {
    return (
      <Layout clubName={clubName} logoUrl={preview.club_logo_url}>
        <AcceptClaimCard token={token} clubName={clubName} />
      </Layout>
    );
  }

  // ── Not authenticated — signup or, if the email already has an account,
  // the normal login flow (SignupForm already detects "already registered"
  // and offers the login link itself) ─────────────────────────────────────
  const nextParam = encodeURIComponent(`/claim-club/${token}`);

  return (
    <Layout clubName={clubName} logoUrl={preview.club_logo_url}>
      <Card variant="elevated">
        <CardContent className="pt-6">
          <p className="text-sm text-brand-muted text-center mb-5">
            Este club fue preparado para ti. Crea tu acceso para comenzar a administrarlo.
          </p>
          <div className="flex flex-col gap-3">
            <Link href={`/auth/signup?next=${nextParam}`}>
              <Button size="lg" className="w-full">
                Crear contraseña
              </Button>
            </Link>
            <Link href={`/auth/login?next=${nextParam}`}>
              <Button size="lg" variant="secondary" className="w-full">
                Ya tengo cuenta
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
