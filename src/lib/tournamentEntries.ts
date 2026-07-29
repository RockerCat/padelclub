import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TournamentEntryRow, TournamentEntryStatus } from "@/types/database";

export interface TournamentEntryMemberDisplay {
  club_member_id: string;
  profile_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface TournamentEntryWithMembers extends TournamentEntryRow {
  // 0-2 items — can be fewer than 2 when RLS hides a member row (a
  // PLAYER's own still-pending entry only ever exposes their own row, not
  // their partner's, see 20260915000001's documented tradeoff). Never
  // padded/guessed — the UI must render the gap explicitly.
  members: TournamentEntryMemberDisplay[];
}

export interface TournamentEntriesCapacity {
  confirmed: number;
  pending: number;
  withdrawn: number;
  occupied: number; // confirmed + pending
  total: number; // tournament.bracket_size
}

const STATUS_ORDER: Record<string, number> = { confirmed: 0, pending: 1, withdrawn: 2 };

function compareEntries(a: TournamentEntryWithMembers, b: TournamentEntryWithMembers): number {
  const orderDiff = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
  if (orderDiff !== 0) return orderDiff;
  return a.created_at.localeCompare(b.created_at);
}

// Shared by the OWNER/ADMIN detail page and the PLAYER detail page — same
// rule, same query shape, never two slightly different versions (CLAUDE.md
// → Shared View & Data Patterns). Exactly 3 queries total, none per-entry/
// per-player: (1) tournament_entries, (2) tournament_entry_members, (3)
// club_members+profiles for the distinct member ids found in (2). RLS
// applies to (1) and (2) exactly as documented in 20260915000001 — this
// function never widens or narrows what each role can see, it only shapes
// whatever rows the caller's own session is already allowed to read.
export async function getTournamentEntriesWithMembers(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  clubId: string
): Promise<{ entries: TournamentEntryWithMembers[]; error: string | null }> {
  const [entriesRes, membersRes] = await Promise.all([
    supabase
      .from("tournament_entries")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("club_id", clubId),
    supabase
      .from("tournament_entry_members")
      .select("id, tournament_entry_id, club_member_id")
      .eq("tournament_id", tournamentId)
      .eq("club_id", clubId),
  ]);

  if (entriesRes.error || membersRes.error) {
    return { entries: [], error: "No se pudieron cargar las inscripciones." };
  }

  const memberRows = membersRes.data ?? [];
  const memberIds = [...new Set(memberRows.map((m) => m.club_member_id))];

  const displayByMemberId = new Map<string, TournamentEntryMemberDisplay>();
  if (memberIds.length > 0) {
    const { data: clubMembers, error: clubMembersError } = await supabase
      .from("club_members")
      .select("id, profile_id, profiles(full_name, avatar_url)")
      .eq("club_id", clubId)
      .in("id", memberIds);

    if (clubMembersError) {
      return { entries: [], error: "No se pudieron cargar las inscripciones." };
    }

    for (const cm of clubMembers ?? []) {
      const profile = Array.isArray(cm.profiles) ? cm.profiles[0] : cm.profiles;
      displayByMemberId.set(cm.id, {
        club_member_id: cm.id,
        profile_id: cm.profile_id,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      });
    }
  }

  const membersByEntryId = new Map<string, TournamentEntryMemberDisplay[]>();
  for (const row of memberRows) {
    const list = membersByEntryId.get(row.tournament_entry_id) ?? [];
    const display = displayByMemberId.get(row.club_member_id);
    // Falls back to a placeholder (never a raw UUID) when RLS hid the
    // underlying club_members/profiles row for this specific member.
    list.push(display ?? { club_member_id: row.club_member_id, profile_id: null, full_name: null, avatar_url: null });
    membersByEntryId.set(row.tournament_entry_id, list);
  }

  const entries: TournamentEntryWithMembers[] = (entriesRes.data ?? []).map((entry) => ({
    ...entry,
    members: membersByEntryId.get(entry.id) ?? [],
  }));

  entries.sort(compareEntries);

  return { entries, error: null };
}

export function summarizeCapacity(entries: TournamentEntryWithMembers[], bracketSize: number): TournamentEntriesCapacity {
  const count = (status: TournamentEntryStatus) => entries.filter((e) => e.status === status).length;
  const confirmed = count("confirmed");
  const pending = count("pending");
  const withdrawn = count("withdrawn");
  return { confirmed, pending, withdrawn, occupied: confirmed + pending, total: bracketSize };
}

// isOwnEntry: created_by is the reliable signal for "I created this entry
// myself" (always my own auth uid for a self-registered pending/withdrawn
// entry) — but a CONFIRMED entry's created_by can belong to the OWNER/ADMIN
// who registered it on the player's behalf, so membership in `members` is
// also checked. Display-only — never used for RPC authorization, the RPCs
// re-derive that themselves.
export function isOwnEntry(entry: TournamentEntryWithMembers, userId: string, ownClubMemberId: string): boolean {
  if (entry.created_by === userId) return true;
  return entry.members.some((m) => m.club_member_id === ownClubMemberId);
}
