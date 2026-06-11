/**
 * Returns the canonical entry path for a club based on the user's role.
 * Use this wherever post-login or post-club-select redirects happen.
 *
 * OWNER  → admin settings (full control starting point)
 * ADMIN  → courts (daily operations starting point)
 * PLAYER → club home (player portal, future)
 */
export function getClubEntryPath(slug: string, role: string): string {
  if (role === "OWNER") return `/${slug}/admin/settings`;
  if (role === "ADMIN") return `/${slug}/admin/courts`;
  return `/${slug}`;
}
