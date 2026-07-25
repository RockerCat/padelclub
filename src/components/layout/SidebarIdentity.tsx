import { PlayerAvatar } from "@/components/players/PlayerAvatar";

// The signed-in person, shown once near "Mi Perfil"/"Salir" at the bottom
// of the sidebar — deliberately separate from ClubHeader above it (which
// represents the club, never the user). Shared by AppNav (club sidebar,
// OWNER/ADMIN/PLAYER) and PlatformNav (SUPERADMIN) so this exists in one
// place, not two. Reuses PlayerAvatar as-is for the photo/initials circle —
// no new avatar system.
export function SidebarIdentity({
  name,
  email,
  roleLabel,
  avatarUrl,
}: {
  name: string;
  email: string | null;
  roleLabel: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-xl bg-white/[0.03] border border-white/5">
      <PlayerAvatar player={{ full_name: name, avatar_url: avatarUrl }} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        {/* Skipped when name already IS the email (no full_name on the
            profile) — showing the same string twice reads as broken, not
            as extra information. */}
        {email && email !== name && <p className="text-[11px] text-brand-muted/70 truncate">{email}</p>}
        <p className="text-[11px] text-brand-muted truncate">{roleLabel}</p>
      </div>
    </div>
  );
}
