import { cn } from "@/lib/utils/cn";

interface ClubHeaderProps {
  club: {
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
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

function roleBadgeLabel(role: string): string {
  switch (role) {
    case "OWNER":
      return "Propietario";
    case "ADMIN":
      return "Admin";
    case "PLAYER":
      return "Jugador";
    default:
      return role;
  }
}

export function ClubHeader({ club, role }: ClubHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
      {/* Logo or initials */}
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden",
          !club.logo_url && "bg-white/10 text-white"
        )}
        style={
          !club.logo_url
            ? { backgroundColor: `${club.primary_color}22`, color: club.primary_color }
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

      {/* Club name and role */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{club.name}</p>
        <p className="text-xs text-brand-muted">{roleBadgeLabel(role)}</p>
      </div>
    </div>
  );
}
