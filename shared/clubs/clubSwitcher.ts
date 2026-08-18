import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Backs mobile's "Cambiar de club" (ChangeClubScreen) — the PLAYER/ADMIN
// equivalent of WEB's plain `Link href="/clubs"` (see AppNav.tsx →
// "Cambiar de club"), which lands on src/app/clubs/page.tsx. That page and
// its ExploreSection are Next.js Server/Client Components and stay
// untouched; only their underlying queries/RPCs are mirrored here so mobile
// never re-implements the same rules with different columns/filters.
// WEB is NOT switched to import this file — these functions are net-new,
// mobile-only consumers of the exact same tables/RPCs WEB already reads.

export interface MyClubMembership {
  role: string;
  club: { id: string; name: string; slug: string; logo_url: string | null };
}

type MembershipRow = { role: string; clubs: MyClubMembership["club"] };

// Mirrors the "Mis clubes" membership query in src/app/clubs/page.tsx —
// same columns, same `is_active = true` filter, same `joined_at` ascending
// order. Deliberately does NOT filter `clubs.archived_at`, exactly like
// that query: an archived club keeps read-only member access (see
// CLAUDE.md → Club Archival Principles), so it must stay listed/enterable
// here too, never silently dropped.
export async function getMyClubMemberships(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<MyClubMembership[]> {
  const { data } = await supabase
    .from("club_members")
    .select("role, clubs!inner(id, name, slug, logo_url)")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true });

  return ((data ?? []) as unknown as MembershipRow[]).map((r) => ({ role: r.role, club: r.clubs }));
}

export interface ClubDirectoryEntry {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  description: string | null;
  logo_url: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Mirrors ExploreSection's directory query (src/app/clubs/page.tsx) — same
// `is_active = true` + `archived_at IS NULL` filter, same name order, same
// columns including latitude/longitude (now consumed by ChangeClubScreen's
// own react-native-maps view — see that screen for the map implementation).
export async function getClubDirectory(supabase: SupabaseClient<Database>): Promise<ClubDirectoryEntry[]> {
  const { data } = await supabase
    .from("clubs")
    .select("id, name, slug, visibility, description, logo_url, whatsapp, city, state, latitude, longitude")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("name", { ascending: true });

  return (data ?? []) as unknown as ClubDirectoryEntry[];
}

// Mirrors the pending-join-requests lookup in src/app/clubs/page.tsx —
// drives the "Solicitud pendiente" relation badge, same as WEB.
export async function getPendingJoinRequestClubIds(supabase: SupabaseClient<Database>, userId: string): Promise<string[]> {
  const { data } = await supabase.from("club_join_requests").select("club_id").eq("profile_id", userId).eq("status", "pending");
  return (data ?? []).map((row) => row.club_id as string);
}

// Mirrors updateLastClub (src/lib/actions/profile.ts, app web) — same
// single-column update, same best-effort semantics (a caller here always
// treats a failure as non-fatal, same as WEB's ChangeClubModal/
// UpdateLastClub). Porting this one-line mutation per platform, rather than
// reaching into WEB's own "use server" action from mobile, matches how
// every other trivial single-table mutation in this codebase is already
// handled (see mobile/src/lib/profileMutations.ts).
export async function updateLastClub(supabase: SupabaseClient<Database>, userId: string, clubId: string): Promise<void> {
  await supabase.from("profiles").update({ last_club_id: clubId }).eq("id", userId);
}

export type JoinClubOutcome =
  | { kind: "joined" }
  | { kind: "requested" }
  | { kind: "missing_phone"; message: string }
  | { kind: "error"; message: string };

const MISSING_PHONE_MESSAGE = "Agrega tu número de WhatsApp para unirte al club. El club lo utilizará para contactarte.";

// Mirrors createJoinRequest (src/app/clubs/[slug]/actions.ts, app web) —
// same visibility branch, re-read fresh from `clubs` (never trusted from a
// client-supplied flag), same two RPCs (join_public_club /
// create_join_request) and same error-code mapping. Both RPCs remain the
// real SECURITY DEFINER authority server-side — this function only decides
// which one to call and how to phrase the outcome, exactly like WEB's own
// action, never a second copy of their internal validation.
export async function requestClubAccess(supabase: SupabaseClient<Database>, clubId: string): Promise<JoinClubOutcome> {
  const { data: clubRow, error: clubError } = await supabase
    .from("clubs")
    .select("visibility")
    .eq("id", clubId)
    .eq("is_active", true)
    .is("archived_at", null)
    .single();

  if (clubError || !clubRow) return { kind: "error", message: "Club no encontrado." };

  if (clubRow.visibility === "public") {
    const { error } = await supabase.rpc("join_public_club", { p_club_id: clubId });
    if (error) {
      if (error.code === "42501") return { kind: "error", message: "Este club no permite unirse libremente." };
      if (error.code === "P0002") return { kind: "error", message: "Club no encontrado." };
      if (error.code === "P0006") return { kind: "missing_phone", message: MISSING_PHONE_MESSAGE };
      return { kind: "error", message: "Error al unirte al club." };
    }
    return { kind: "joined" };
  }

  const { error } = await supabase.rpc("create_join_request", { p_club_id: clubId });
  if (error) {
    if (error.code === "23505") return { kind: "error", message: "Ya eres miembro de este club." };
    if (error.code === "22023") return { kind: "error", message: "Tu solicitud anterior fue rechazada. Contacta al club directamente." };
    if (error.code === "P0005") return { kind: "error", message: "Este club se encuentra archivado." };
    if (error.code === "P0006") return { kind: "missing_phone", message: MISSING_PHONE_MESSAGE };
    return { kind: "error", message: "Error al enviar la solicitud." };
  }
  return { kind: "requested" };
}
