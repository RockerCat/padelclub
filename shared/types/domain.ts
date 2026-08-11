// ============================================================
// Domain types (derived from database rows) — Mi Pádel Club
// ============================================================
// These are hand-written convenience aliases (Club, Tournament, ClubRole,
// PricingRule, etc.) over the Supabase-generated Database type. They used
// to live appended directly inside src/types/database.ts, which is why a
// plain `supabase gen types typescript ... > src/types/database.ts` run
// silently wiped all of them out (that command overwrites the whole file)
// and broke ~150 imports across the app — every one of these names simply
// stopped existing.
//
// Root cause fix: this file is the ONLY place these types are defined.
// src/types/database.ts is now — and must stay — a 100% untouched,
// blindly-regeneratable Supabase codegen artifact; nothing here duplicates
// its content, only imports from it. See scripts/generate-types.sh (and
// the "types:generate" npm script) for the one safe way to regenerate
// database.ts without repeating this breakage — it always re-links this
// file back in automatically. Never hand-edit database.ts again; add new
// domain aliases here instead.
// ============================================================

import type { Tables } from "./database";

export type Club = Tables<"clubs">;
export type Profile = Tables<"profiles">;
export type ClubMember = Tables<"club_members">;
export type InvitationLink = Tables<"invitation_links">;
export type PricingRule = Tables<"club_pricing_rules">;
export type PricingRulePrice = Tables<"club_pricing_rule_prices">;

export type ClubRole = ClubMember["role"];
export type InvitationRole = InvitationLink["role"];
export type PlayerCategory = ClubMember["category"];

// club_members.role is DB-enforced to exactly these three values
// (club_members_role_check, see 20260610000001_sprint1_core_schema.sql),
// a CHECK constraint the Supabase generator doesn't expose — so ClubRole
// above resolves to a plain `string`, and `as ClubRole` narrows nothing.
// Share this one real guard everywhere a fetched role needs to become the
// literal union component props expect ([club]/layout.tsx, profile/layout.tsx).
export function isClubRole(role: string): role is "OWNER" | "ADMIN" | "PLAYER" {
  return role === "OWNER" || role === "ADMIN" || role === "PLAYER";
}

// MVP skill-level categories, weakest to strongest — manually assigned by
// admins for now. Order matters for any future ranking/sort UI.
export const PLAYER_CATEGORIES: PlayerCategory[] = [
  "Principiante",
  "5ta",
  "4ta",
  "3ra",
  "2da",
  "1ra",
];

// ClubMember with profile joined — used in players list and nav
export type ClubMemberWithProfile = ClubMember & {
  profiles: Profile;
};

// ClubMember with club joined — used in [club]/layout.tsx
export type ClubMemberWithClub = ClubMember & {
  clubs: Club;
};

export type Court = Tables<"courts">;

export type Reservation = Tables<"reservations">;
export type ReservationPlayer = Tables<"reservation_players">;
export type ReservationType = Reservation["type"];
export type ReservationStatus = Reservation["status"];

export type ClubOperatingHour = Tables<"club_operating_hours">;

// Fase 1 módulo deportivo — global, ordered category catalog (7 fixed
// rows). Only this table's convenience type is exported here: nothing in
// this provisioning block reads club_ranking_cycles/club_member_sport_state/
// club_player_category_changes/club_player_point_movements directly from
// client code yet.
export type SportCategory = Tables<"sport_categories">;

export type ClubNews = Tables<"club_news">;

// ClubNews with the author's profile joined — used in the admin Noticias list
export type ClubNewsWithAuthor = ClubNews & {
  created_by_profile: Pick<Profile, "full_name"> | null;
};

// Torneos — el torneo es únicamente un evento de club (Bloque 1, nueva
// especificación funcional). Sin partidos/rondas/llaves/canchas.
export type Tournament = Tables<"tournaments">;
export type TournamentStatus = Tournament["status"];
export type TournamentVisibility = Tournament["visibility"];

// Torneos — inscripciones (duplas) y sus integrantes.
export type TournamentEntryRow = Tables<"tournament_entries">;
export type TournamentEntryStatus = TournamentEntryRow["status"];
export type TournamentEntryMemberRow = Tables<"tournament_entry_members">;
