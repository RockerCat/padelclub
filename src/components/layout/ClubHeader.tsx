import { clubRoleLabel } from "@/lib/roleLabels";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

interface ClubHeaderProps {
  club: {
    name: string;
    slug: string;
    logo_url: string | null;
  };
  role: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ClubHeader({ club, role }: ClubHeaderProps) {
  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-5 shrink-0">
      {/* Radial glow background — primary top-left, secondary bottom-right */}
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 25% 0%, var(--club-primary), transparent 65%), radial-gradient(ellipse at 75% 100%, var(--club-secondary), transparent 65%)",
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-3 text-center">
        {/* Logo */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden ring-1 ring-white/10"
          style={
            !club.logo_url
              ? {
                  backgroundColor: `${CLUB_PRIMARY_COLOR}22`,
                  color: CLUB_PRIMARY_COLOR,
                }
              : undefined
          }
        >
          {club.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={club.logo_url}
              alt={`Logo de ${club.name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            getInitials(club.name)
          )}
        </div>

        {/* Name + role */}
        <div>
          <p className="text-sm font-bold text-white leading-tight">{club.name}</p>
          <p className="text-xs text-brand-muted mt-0.5">{clubRoleLabel(role)}</p>
        </div>
      </div>

      {/* Bottom gradient separator — replaces border-b */}
      <div
        className="absolute inset-x-0 bottom-0 h-0.5"
        style={{
          background:
            "linear-gradient(to right, transparent 10%, var(--club-primary) 25%, var(--club-secondary) 75%, transparent 90%)",
        }}
      />
    </div>
  );
}
