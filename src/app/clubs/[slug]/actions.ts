"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string };

export async function createJoinRequest(clubId: string, clubSlug: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { error: "Debes iniciar sesión para solicitar ingreso." };

  // Defense in depth: the UI only shows "Solicitar ingreso" for private
  // clubs, but a public club lets anyone join directly, so a request here
  // would never make sense — block it at the source instead of relying
  // solely on the button being hidden.
  const { data: club } = await supabase
    .from("clubs")
    .select("visibility")
    .eq("id", clubId)
    .single();

  if (club?.visibility !== "private") return { error: "Este club no requiere solicitud de ingreso." };

  const { data: existingMembership } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (existingMembership) return { error: "Ya eres miembro de este club." };

  const { error } = await supabase
    .from("club_join_requests")
    .insert({ club_id: clubId, profile_id: user.id });

  if (error) {
    // Unique violation = a pending request already exists — treat as success.
    if (error.code !== "23505") return { error: "Error al enviar la solicitud." };
  }

  revalidatePath(`/clubs/${clubSlug}`);
  return {};
}
