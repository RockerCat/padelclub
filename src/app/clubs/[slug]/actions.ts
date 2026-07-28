"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getClubEntryPath } from "@/lib/utils/navigation";

type ActionResult = { error?: string; redirectTo?: string; missingPhone?: boolean };

const MISSING_PHONE_MESSAGE = "Agrega tu número de WhatsApp para unirte al club. El club lo utilizará para contactarte.";

// Public and private clubs diverge here, decided from clubs.visibility
// re-read fresh from Supabase — never from a client-supplied flag, which
// only ever drives the button's label text and could be stale.
//
// Public: join_public_club (SECURITY DEFINER, migration
// 20260611000005_club_visibility.sql) re-validates visibility itself,
// inserts club_members directly (role PLAYER, no approval), and is
// idempotent — an existing ACTIVE membership is a silent no-op, never an
// error. No club_join_requests row, no OWNER/ADMIN notification. Any other
// failure (club no longer public, a leftover inactive/removed row
// conflicting with the unique (club_id, profile_id) constraint, etc.) is
// surfaced as a real, generic error — never masked as success and never the
// private flow's "Ya eres miembro de este club" copy, which describes a
// different code path.
//
// Private: unchanged — create_join_request (SECURITY DEFINER) validates
// membership/duplicate state and notifies every OWNER/ADMIN of the club
// atomically — see migration 20260727000002_join_requests_status.sql.
export async function createJoinRequest(clubId: string, clubSlug: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { error: "Debes iniciar sesión para solicitar ingreso." };

  const { data: clubRow, error: clubError } = await supabase
    .from("clubs")
    .select("visibility")
    .eq("id", clubId)
    .eq("is_active", true)
    .is("archived_at", null)
    .single();

  if (clubError || !clubRow) return { error: "Club no encontrado." };

  if (clubRow.visibility === "public") {
    const { error } = await supabase.rpc("join_public_club", { p_club_id: clubId });

    if (error) {
      if (error.code === "42501") return { error: "Este club no permite unirse libremente." };
      if (error.code === "P0002") return { error: "Club no encontrado." };
      if (error.code === "P0006") return { error: MISSING_PHONE_MESSAGE, missingPhone: true };
      return { error: "Error al unirte al club." };
    }

    revalidatePath(`/${clubSlug}`);
    revalidatePath(`/clubs/${clubSlug}`);

    // Real membership row, not an assumed role — join_public_club only ever
    // assigns PLAYER, but this confirms it against what Supabase actually
    // has rather than hardcoding the redirect.
    const { data: membership } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single();

    return { redirectTo: getClubEntryPath(clubSlug, membership?.role ?? "PLAYER") };
  }

  const { error } = await supabase.rpc("create_join_request", { p_club_id: clubId });

  if (error) {
    if (error.code === "23505") return { error: "Ya eres miembro de este club." };
    if (error.code === "22023") {
      return { error: "Tu solicitud anterior fue rechazada. Contacta al club directamente." };
    }
    if (error.code === "P0005") return { error: "Este club se encuentra archivado." };
    if (error.code === "P0006") return { error: MISSING_PHONE_MESSAGE, missingPhone: true };
    return { error: "Error al enviar la solicitud." };
  }

  revalidatePath(`/${clubSlug}`);
  revalidatePath(`/clubs/${clubSlug}`);
  return {};
}
