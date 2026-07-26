"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { addMinutes } from "@/lib/courtAvailability";
import type { PlayerCategory } from "@/types/database";

export type ActionState = { success?: boolean; error?: string; data?: unknown };

type ActiveReservationRow = { date: string; start_time: string; duration_minutes: number };

function reservationEndDatetime(r: ActiveReservationRow): Date {
  const endTime = addMinutes(r.start_time.slice(0, 5), r.duration_minutes);
  return new Date(`${r.date}T${endTime}`);
}

// ─── Permission guard ─────────────────────────────────────────────────────────

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { supabase: null, user: null, role: null, error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return { supabase: null, user: null, role: null, error: "Sin permiso." };
  }

  return { supabase, user, role: membership.role as "OWNER" | "ADMIN", error: null };
}

// ─── toggleMemberActive ───────────────────────────────────────────────────────
// Deactivation (isActive === false) is routed through deactivate_player
// (Phase 6, SECURITY DEFINER) — it re-derives the executor's role, the
// target's membership/role/account_type, cancels the target's own future
// reservations, removes their participation in others' future
// reservations, deactivates the membership, and notifies, all atomically.
// This replaced the previous behavior of simply BLOCKING deactivation
// whenever the target had an active reservation — deactivating a club
// member is now an operational cleanup, not something an admin gets stuck
// on. Activation (isActive === true) is unchanged: reactivation flows are
// out of scope for this phase, so it keeps the exact same direct
// club_members update as before (still permitted by the existing
// column-level GRANT UPDATE (is_active, category), 20260809000001).

export async function toggleMemberActive(
  clubId: string,
  memberId: string,
  isActive: boolean,
  clubSlug: string
): Promise<ActionState> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  const { data: target } = await supabase
    .from("club_members")
    .select("profile_id, role")
    .eq("id", memberId)
    .eq("club_id", clubId)
    .single();

  if (!target) return { error: "Miembro no encontrado." };
  if (target.profile_id === user.id) return { error: "No puedes modificar tu propio estado." };
  if (target.role === "OWNER") return { error: "No se puede desactivar a un Owner." };

  if (isActive === false) {
    const { error } = await supabase.rpc("deactivate_player", {
      p_club_id: clubId,
      p_player_id: target.profile_id,
    });

    if (error) {
      if (error.code === "P0002") return { error: "Este jugador ya no pertenece al club." };
      if (error.code === "22023") return { error: "Este jugador ya está desactivado." };
      if (error.code === "42501") return { error: "No tienes permiso para desactivar a este jugador." };
      console.error("[toggleMemberActive] deactivate_player failed:", { clubId, memberId, supabaseError: error });
      return { error: "Error al desactivar al jugador. Intenta nuevamente." };
    }

    revalidatePath(`/${clubSlug}/admin/players`);
    return { success: true };
  }

  const { error } = await supabase
    .from("club_members")
    .update({ is_active: true })
    .eq("id", memberId)
    .eq("club_id", clubId);

  if (error) return { error: "Error al cambiar el estado del miembro." };

  revalidatePath(`/${clubSlug}/admin/players`);
  return { success: true };
}

// ─── updateMemberCategory ─────────────────────────────────────────────────────
// Category (skill level) is manually assigned by admins — no automatic
// calculation yet. Any OWNER/ADMIN can set it (unlike role changes, which
// are OWNER-only).

export async function updateMemberCategory(
  clubId: string,
  memberId: string,
  category: PlayerCategory,
  clubSlug: string
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from("club_members")
    .update({ category })
    .eq("id", memberId)
    .eq("club_id", clubId);

  if (error) return { error: "Error al actualizar la categoría." };

  revalidatePath(`/${clubSlug}/admin/players`);
  return { success: true };
}

// ─── getMatchesPlayedCount ────────────────────────────────────────────────────
// "Partidos jugados" in the member detail — computed on demand (called when
// MemberModal opens/reopens), never persisted, so it's always derived fresh
// from the real reservations/reservation_players data instead of drifting
// out of sync. Counts a reservation once per player when it: belongs to this
// exact club, is type 'match' (never 'class'/'block'), is status 'confirmed'
// (never pending/cancelled/rejected — approving a pending request only ever
// flips this same row's status in place, never creates a second row/table,
// so this already covers both directly-created and approved-from-request
// matches uniformly), has already ended (reservationEndDatetime, same
// date+start_time+duration_minutes local-Date computation as the
// deactivation guard above — no new timezone convention), and the player is
// related to it as creator (created_by) OR as an added participant
// (reservation_players) — deduped by reservation id via a Map so a player
// who is both never counts twice.
export async function getMatchesPlayedCount(
  clubId: string,
  profileId: string
): Promise<{ count?: number; error?: string }> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  type MatchRow = ActiveReservationRow & { id: string };

  const [ownRes, participantRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, date, start_time, duration_minutes")
      .eq("club_id", clubId)
      .eq("created_by", profileId)
      .eq("type", "match")
      .eq("status", "confirmed")
      .limit(1000),
    supabase
      .from("reservation_players")
      .select("reservations!inner(id, date, start_time, duration_minutes, type, status, club_id)")
      .eq("profile_id", profileId)
      .eq("reservations.club_id", clubId)
      .eq("reservations.type", "match")
      .eq("reservations.status", "confirmed")
      .limit(1000),
  ]);

  if (ownRes.error || participantRes.error) {
    return { error: "Error al calcular los partidos jugados." };
  }

  const ownRows = (ownRes.data ?? []) as MatchRow[];
  const participantRows = (
    (participantRes.data ?? []) as unknown as { reservations: MatchRow }[]
  ).map((row) => row.reservations);

  const byId = new Map<string, MatchRow>();
  for (const r of [...ownRows, ...participantRows]) byId.set(r.id, r);

  const count = [...byId.values()].filter((r) => reservationEndDatetime(r).getTime() < Date.now()).length;

  return { count };
}

// ─── approveJoinRequest ────────────────────────────────────────────────────────
// approve_join_request (SECURITY DEFINER) re-checks the caller's role for
// this exact club, the request's club_id and its pending status, inserts
// club_members, marks the request approved and notifies the requester —
// all atomically. See migration 20260727000002_join_requests_status.sql.

export async function approveJoinRequest(
  clubId: string,
  requestId: string,
  clubSlug: string
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.rpc("approve_join_request", { p_request_id: requestId });

  if (error) {
    if (error.code === "P0002") return { error: "Solicitud no encontrada." };
    if (error.code === "22023") return { error: "Esta solicitud ya fue resuelta." };
    return { error: "Error al aprobar la solicitud." };
  }

  revalidatePath(`/${clubSlug}/admin/players`);
  return { success: true };
}

// ─── rejectJoinRequest ─────────────────────────────────────────────────────────

export async function rejectJoinRequest(
  clubId: string,
  requestId: string,
  clubSlug: string
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.rpc("reject_join_request", { p_request_id: requestId });

  if (error) {
    if (error.code === "P0002") return { error: "Solicitud no encontrada." };
    if (error.code === "22023") return { error: "Esta solicitud ya fue resuelta." };
    return { error: "Error al rechazar la solicitud." };
  }

  revalidatePath(`/${clubSlug}/admin/players`);
  return { success: true };
}
