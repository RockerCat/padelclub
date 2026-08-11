// Portado literal de src/lib/roleLabels.ts (app web).
export const CLUB_ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  PLAYER: "Jugador",
};

export function clubRoleLabel(role: string): string {
  return CLUB_ROLE_LABELS[role] ?? role;
}
