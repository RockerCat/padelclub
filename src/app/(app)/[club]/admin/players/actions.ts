"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertSingleUseInvite } from "@/lib/invitations";
import { addMinutes } from "@/lib/courtAvailability";
import type { PlayerCategory } from "@/types/database";

export type ActionState = { success?: boolean; error?: string; data?: unknown };

// ─── Deactivation guard: active reservations ───────────────────────────────────
// A member with at least one still-active reservation — as creator/holder OR
// as an added participant — must never be deactivated. "Active" mirrors the
// real states used everywhere else in the project (CLAUDE.md "Reservation
// Status Principles"): pending (awaiting review) and confirmed are active;
// cancelled/rejected never block. "block" reservations (court closures) have
// no real player relationship and are excluded. A reservation's end is
// computed the same offset-less-local-Date way checkNotInPast already
// computes "is this in the past" in admin/reservations/actions.ts — date +
// start_time + duration_minutes — no new timezone convention invented here.
const ACTIVE_RESERVATION_STATUSES = ["pending", "confirmed"] as const;

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

export async function toggleMemberActive(
  clubId: string,
  memberId: string,
  isActive: boolean,
  clubSlug: string
): Promise<ActionState> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  // Prevent self-deactivation
  const { data: target } = await supabase
    .from("club_members")
    .select("profile_id, role")
    .eq("id", memberId)
    .eq("club_id", clubId)
    .single();

  if (!target) return { error: "Miembro no encontrado." };
  if (target.profile_id === user.id) return { error: "No puedes modificar tu propio estado." };
  if (target.role === "OWNER") return { error: "No se puede desactivar a un Owner." };

  // Only gates deactivation (never activation), and runs immediately before
  // the update below to keep the race window between "we checked" and "we
  // wrote" as small as possible. Reads reservations/reservation_players
  // fresh from Supabase under the calling OWNER/ADMIN's own session (both
  // tables are readable by any active club member via RLS — "club members
  // read reservations"/"club members read reservation_players" — no new RPC
  // needed for a plain conditional read), scoped to this exact club and the
  // real target.profile_id just read above — never data already loaded in
  // the UI.
  if (isActive === false) {
    const [ownRes, participantRes] = await Promise.all([
      supabase
        .from("reservations")
        .select("date, start_time, duration_minutes")
        .eq("club_id", clubId)
        .eq("created_by", target.profile_id)
        .in("status", ACTIVE_RESERVATION_STATUSES)
        .neq("type", "block")
        .limit(200),
      supabase
        .from("reservation_players")
        .select("reservations!inner(date, start_time, duration_minutes, status, type, club_id)")
        .eq("profile_id", target.profile_id)
        .eq("reservations.club_id", clubId)
        .in("reservations.status", ACTIVE_RESERVATION_STATUSES)
        .neq("reservations.type", "block")
        .limit(200),
    ]);

    if (ownRes.error || participantRes.error) {
      return { error: "Error al validar las reservaciones del jugador." };
    }

    const ownRows = (ownRes.data ?? []) as ActiveReservationRow[];
    const participantRows = (
      (participantRes.data ?? []) as unknown as { reservations: ActiveReservationRow }[]
    ).map((row) => row.reservations);

    const hasBlockingReservation = [...ownRows, ...participantRows].some(
      (r) => reservationEndDatetime(r).getTime() > Date.now()
    );

    if (hasBlockingReservation) {
      return { error: "No puedes desactivar a este jugador porque tiene reservaciones activas pendientes por jugar." };
    }
  }

  const { error } = await supabase
    .from("club_members")
    .update({ is_active: isActive })
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

// ─── createInvitationLink ─────────────────────────────────────────────────────
// Player invitations only (admin invitations are a separate flow — see
// team/actions.ts's createAdminInvite). Single-use/non-expiring insert
// shape is shared with that flow via insertSingleUseInvite — same model,
// same rules, just a different role and a different permission guard.

export async function createInvitationLink(
  clubId: string,
  clubSlug: string
): Promise<ActionState> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  const { data, error } = await insertSingleUseInvite(supabase, {
    clubId,
    role: "PLAYER",
    createdBy: user.id,
  });

  if (error || !data) return { error: "Error al crear la invitación." };

  revalidatePath(`/${clubSlug}/admin/players`);
  return { success: true, data: { token: data.token } };
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

// ─── deactivateInvitationLink ─────────────────────────────────────────────────

export async function deactivateInvitationLink(
  clubId: string,
  linkId: string,
  clubSlug: string
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from("invitation_links")
    .update({ is_active: false })
    .eq("id", linkId)
    .eq("club_id", clubId);

  if (error) return { error: "Error al revocar la invitación." };

  revalidatePath(`/${clubSlug}/admin/players`);
  return { success: true };
}
