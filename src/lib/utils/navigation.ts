import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Returns the canonical entry path for a club based on the user's role.
 * Use this wherever post-login or post-club-select redirects happen.
 *
 * OWNER  → dashboard (operational home for configured clubs)
 * ADMIN  → reservations (daily operations starting point)
 * PLAYER → home (member's home: reservations/requests first, club info below)
 */
export function getClubEntryPath(slug: string, role: string): string {
  if (role === "OWNER") return `/${slug}/dashboard`;
  if (role === "ADMIN") return `/${slug}/admin/reservations`;
  return `/${slug}/home`;
}

type MembershipRow = { role: string; clubs: { id: string; slug: string; archived_at: string | null } };

/**
 * Single source of truth for "which club (if any) should this authenticated
 * user land in right now" — called by both password login (LoginForm) and
 * the OAuth/magic-link/invite auth callback, so neither can drift into a
 * different rule than the other. Platform-admin routing and any explicit
 * ?next= are decided by the caller before reaching this — this function is
 * only the club-membership part of that decision.
 *
 * - 0 active memberships (after dropping archived clubs — see below) →
 *   "/clubs" (today's discover/create experience, unchanged).
 * - Exactly 1 active membership → straight into it via getClubEntryPath.
 * - 2+ active memberships:
 *     - profiles.last_club_id points at one the user is still an active
 *       member of → straight into that one via getClubEntryPath.
 *     - otherwise (null, or points at a club/membership that no longer
 *       applies) → "/clubs" (the picker), unchanged.
 *
 * A membership at an archived club is dropped before any of the above
 * counting/matching happens — an archived club is never auto-entered, even
 * if it's the user's only membership or their last_club_id.
 *
 * Read-only: never writes last_club_id itself (that stays exactly as-is,
 * via UpdateLastClub on club layout mount) and never "fixes" a stale value.
 */
export async function resolveClubEntryPath(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string> {
  const { data: memberships } = await supabase
    .from("club_members")
    .select("role, clubs!inner(id, slug, archived_at)")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true });

  const rows = ((memberships ?? []) as unknown as MembershipRow[]).filter((m) => !m.clubs.archived_at);

  if (rows.length === 0) {
    return "/clubs";
  }

  if (rows.length === 1) {
    return getClubEntryPath(rows[0].clubs.slug, rows[0].role);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("last_club_id")
    .eq("id", userId)
    .single();

  const lastClubId = profile?.last_club_id;
  if (lastClubId) {
    const match = rows.find((m) => m.clubs.id === lastClubId);
    if (match) {
      return getClubEntryPath(match.clubs.slug, match.role);
    }
  }

  return "/clubs";
}
