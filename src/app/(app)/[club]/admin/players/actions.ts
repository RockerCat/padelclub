"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertSingleUseInvite } from "@/lib/invitations";
import type { PlayerCategory } from "@/types/database";

export type ActionState = { success?: boolean; error?: string; data?: unknown };

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
