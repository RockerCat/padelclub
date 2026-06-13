/**
 * Returns the canonical entry path for a club based on the user's role.
 * Use this wherever post-login or post-club-select redirects happen.
 *
 * OWNER  → dashboard (operational home for configured clubs)
 * ADMIN  → reservations (daily operations starting point)
 * PLAYER → reservations (player's operational home until a real portal exists)
 */
export function getClubEntryPath(slug: string, role: string): string {
  if (role === "OWNER") return `/${slug}/dashboard`;
  if (role === "ADMIN") return `/${slug}/admin/reservations`;
  return `/${slug}/reservations`;
}
