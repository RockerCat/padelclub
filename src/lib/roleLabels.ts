// Single source for the Spanish labels shown for a club role — the same
// wording already used across club member listings, invites and signup
// (OWNER/ADMIN/PLAYER → Propietario/Administrador/Jugador). Reused by the
// sidebar (ClubHeader's role badge, SidebarIdentity) instead of a second,
// slightly different copy of the same map.
export const CLUB_ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  PLAYER: "Jugador",
};

export function clubRoleLabel(role: string): string {
  return CLUB_ROLE_LABELS[role] ?? role;
}

// profiles.is_platform_admin is a standalone boolean, not a club role — the
// rest of the app shows it as the English "Platform Admin" string. This is
// the first Spanish label for that concept, used only by the sidebar
// identity block (SidebarIdentity) in the platform area.
export const PLATFORM_ADMIN_LABEL = "Superadministrador";
