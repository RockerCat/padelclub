"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertSingleUseInvite } from "@/lib/invitations";

type ActionResult = { error?: string };

async function requireOwnerRole(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase: null, user: null, error: "No autenticado." };
  }

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "OWNER") {
    return { supabase: null, user: null, error: "Solo el propietario puede realizar esta acción." };
  }

  return { supabase, user, error: null };
}

export async function removeAdmin(
  clubId: string,
  memberId: string,
  clubSlug: string
): Promise<ActionResult> {
  const { supabase, user, error: authError } = await requireOwnerRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  const { data: target } = await supabase
    .from("club_members")
    .select("profile_id, role")
    .eq("id", memberId)
    .eq("club_id", clubId)
    .single();

  if (!target) return { error: "Administrador no encontrado." };
  if (target.profile_id === user.id) return { error: "No puedes removerte a ti mismo del equipo." };
  if (target.role !== "ADMIN") return { error: "Este miembro no es administrador." };

  const { error } = await supabase
    .from("club_members")
    .update({ is_active: false })
    .eq("id", memberId)
    .eq("club_id", clubId);

  if (error) return { error: "Error al remover al administrador del equipo." };

  revalidatePath(`/${clubSlug}/admin/team`);
  return {};
}

// The only real, tracked, token-based invitation left in the product —
// player invitations were retired (Phase 2, see CLAUDE.md → Club Sharing
// Principles); players only ever link to a club via join_public_club or
// create_join_request+approve_join_request. Same single-use/non-expiring
// model as before via the shared insertSingleUseInvite.
export async function createAdminInvite(
  clubId: string,
  clubSlug: string
): Promise<ActionResult> {
  const { supabase, user, error: authError } = await requireOwnerRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  const { data: clubRow } = await supabase
    .from("clubs")
    .select("archived_at")
    .eq("id", clubId)
    .single();

  if (clubRow?.archived_at) return { error: "Este club se encuentra archivado y no puede crear nuevas invitaciones." };

  const { error } = await insertSingleUseInvite(supabase, {
    clubId,
    role: "ADMIN",
    createdBy: user.id,
  });

  if (error) return { error: "Error al crear la invitación." };

  revalidatePath(`/${clubSlug}/admin/team`);
  return {};
}

export async function deactivateAdminInvite(
  clubId: string,
  linkId: string,
  clubSlug: string
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireOwnerRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from("invitation_links")
    .update({ is_active: false })
    .eq("id", linkId)
    .eq("club_id", clubId);

  if (error) return { error: "Error al revocar la invitación." };

  revalidatePath(`/${clubSlug}/admin/team`);
  return {};
}
