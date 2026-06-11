import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignupForm, type InviteBranding } from "./SignupForm";

interface SignupPageProps {
  searchParams: Promise<{ invite?: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  PLAYER: "jugador",
  ADMIN: "administrador",
};

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

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { invite } = await searchParams;

  let branding: InviteBranding | null = null;

  if (invite) {
    const supabase = await createClient();
    const { data: preview } = await supabase.rpc("get_invitation_preview", {
      p_token: invite,
    });

    const info = preview as {
      valid?: boolean;
      club_name?: string;
      club_logo_url?: string | null;
      primary_color?: string;
      secondary_color?: string;
      role?: string;
    } | null;

    if (info?.club_name && info.primary_color && info.secondary_color) {
      branding = {
        clubName: info.club_name,
        logoUrl: info.club_logo_url ?? null,
        primaryColor: info.primary_color,
        secondaryColor: info.secondary_color,
        roleLabel: ROLE_LABELS[info.role ?? "PLAYER"] ?? "miembro",
      };
    }
  }

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
        {/* Header: club branding OR PadelClub */}
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
            <Link href="/" className="inline-block">
              <span className="text-3xl font-black tracking-tight text-white">
                Padel<span className="text-brand-primary">Club</span>
              </span>
            </Link>
            <p className="text-brand-muted text-sm mt-2">Crea tu cuenta</p>
          </div>
        )}

        <SignupForm inviteToken={invite} branding={branding} />

        {branding && (
          <p className="text-xs text-brand-muted/40 text-center mt-6">
            Powered by PadelClub
          </p>
        )}
      </div>
    </div>
  );
}
