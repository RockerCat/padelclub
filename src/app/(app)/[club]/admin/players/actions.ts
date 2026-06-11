"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
  revalidatePath(`/${clubSlug}/admin/players/${memberId}`);
  return { success: true };
}

// ─── changeMemberRole ─────────────────────────────────────────────────────────

export async function changeMemberRole(
  clubId: string,
  memberId: string,
  newRole: "ADMIN" | "PLAYER",
  clubSlug: string
): Promise<ActionState> {
  const { supabase, user, role: callerRole, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  // Only OWNER can change roles
  if (callerRole !== "OWNER") return { error: "Solo un Owner puede cambiar roles." };

  const { data: target } = await supabase
    .from("club_members")
    .select("profile_id, role")
    .eq("id", memberId)
    .eq("club_id", clubId)
    .single();

  if (!target) return { error: "Miembro no encontrado." };
  if (target.profile_id === user.id) return { error: "No puedes cambiar tu propio rol." };
  if (target.role === "OWNER") return { error: "No se puede cambiar el rol de un Owner." };

  const { error } = await supabase
    .from("club_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("club_id", clubId);

  if (error) return { error: "Error al cambiar el rol." };

  revalidatePath(`/${clubSlug}/admin/players`);
  revalidatePath(`/${clubSlug}/admin/players/${memberId}`);
  return { success: true };
}

// ─── createInvitationLink ─────────────────────────────────────────────────────

export async function createInvitationLink(
  clubId: string,
  role: "PLAYER" | "ADMIN",
  clubSlug: string
): Promise<ActionState> {
  const { supabase, user, role: callerRole, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  // ADMIN can only create PLAYER links
  if (callerRole === "ADMIN" && role !== "PLAYER") {
    return { error: "Un Admin solo puede crear invitaciones para jugadores." };
  }

  const { data, error } = await supabase
    .from("invitation_links")
    .insert({
      club_id: clubId,
      role,
      created_by: user.id,
      // expires_at defaults to 7 days in DB
      // max_uses: null = unlimited (share via WhatsApp group etc.)
    })
    .select("token")
    .single();

  if (error || !data) return { error: "Error al crear la invitación." };

  revalidatePath(`/${clubSlug}/admin/players`);
  return { success: true, data: { token: data.token } };
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
