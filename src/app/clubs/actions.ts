"use server";

import { createClient } from "@/lib/supabase/server";

export async function joinClub(clubId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No autenticado." };

  const { error } = await supabase.rpc("join_public_club", {
    p_club_id: clubId,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "Este club no permite unirse libremente." };
    }
    if (error.code === "P0002") {
      return { error: "Club no encontrado." };
    }
    return { error: error.message };
  }

  return {};
}
