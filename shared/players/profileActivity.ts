import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Single source of truth for the shape returned by
// public.get_my_profile_activity (20260817000001_profile_activity.sql) —
// the authenticated caller's own reservation activity across every club
// they've ever been part of, including clubs they've left, been
// deactivated from, or that are now archived. No monetary field, no
// ranking/attendance field — none of that is honestly computable from this
// schema (see the migration's own header comment).
//
// WEB re-exports this same function under its historical name
// (src/lib/profileActivity.ts) so no existing import changes; mobile uses
// it directly (mobile/src/lib/profileActivity.ts) for ProfileScreen.

export interface ProfileActivitySummary {
  totalReservations: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  rejected: number;
  matches: number;
  classes: number;
  confirmedMinutes: number;
  confirmedHours: number;
}

export interface ProfileActivityTypePoint {
  type: "match" | "class";
  label: string;
  count: number;
}

export interface ProfileActivityMonthPoint {
  month: string; // "YYYY-MM"
  count: number;
}

export interface ProfileActivityReservation {
  id: string;
  clubName: string;
  courtName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMinutes: number;
  type: "match" | "class";
  status: "confirmed" | "pending" | "cancelled" | "rejected";
}

export interface ProfileActiveMembership {
  clubName: string;
  role: "OWNER" | "ADMIN" | "PLAYER";
  archived: boolean;
}

export interface ProfileActivity {
  summary: ProfileActivitySummary;
  typeDistribution: ProfileActivityTypePoint[];
  monthlyActivity: ProfileActivityMonthPoint[];
  recentReservations: ProfileActivityReservation[];
  activeMemberships: ProfileActiveMembership[];
}

export type ProfileActivityResult =
  | { data: ProfileActivity; error: null }
  | { data: null; error: string };

// Thin wrapper — the RPC accepts no parameters at all (never a profile id
// of any kind); authorization and identity both derive from auth.uid()
// entirely inside get_my_profile_activity.
export async function getMyProfileActivity(
  supabase: SupabaseClient<Database>
): Promise<ProfileActivityResult> {
  const { data, error } = await supabase.rpc("get_my_profile_activity");

  if (error || !data) {
    return { data: null, error: "No se pudo cargar tu actividad. Intenta nuevamente." };
  }

  return { data: data as unknown as ProfileActivity, error: null };
}
