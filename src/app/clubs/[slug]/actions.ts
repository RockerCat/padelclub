"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string };

// create_join_request (SECURITY DEFINER) validates membership/duplicate
// state and notifies every OWNER/ADMIN of the club atomically — see
// migration 20260727000002_join_requests_status.sql. No visibility branch
// here: public and private clubs go through the same request+approval
// flow.
export async function createJoinRequest(clubId: string, clubSlug: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { error: "Debes iniciar sesión para solicitar ingreso." };

  const { error } = await supabase.rpc("create_join_request", { p_club_id: clubId });

  if (error) {
    if (error.code === "23505") return { error: "Ya eres miembro de este club." };
    if (error.code === "22023") {
      return { error: "Tu solicitud anterior fue rechazada. Contacta al club directamente." };
    }
    return { error: "Error al enviar la solicitud." };
  }

  revalidatePath(`/${clubSlug}`);
  revalidatePath(`/clubs/${clubSlug}`);
  return {};
}
