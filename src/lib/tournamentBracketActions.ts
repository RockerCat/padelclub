"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Tournament } from "@/types/database";

export type TournamentBracketActionState = {
  success?: boolean;
  error?: string;
  tournament?: Tournament;
};

// Lives in a neutral shared location (not under admin/tournaments) so the
// shared BracketSection component (used by both the OWNER/ADMIN and PLAYER
// detail pages) never has to import across route boundaries — same
// reasoning as tournamentEntryActions.ts. Bracket generation itself stays
// OWNER/ADMIN-only; the RPC re-derives that authorization regardless of
// which route rendered the button that called this.
//
// Every real code/message here comes directly from
// 20260918000001_fix_tournament_lifecycle_returns_regression.sql (the
// RETURNS TABLE fix) and the original 20260911000001 body — never invented.

function tournamentBracketErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "No tienes permisos para realizar esta acción.";
  if (error.code === "P0002") return "El torneo no existe o ya no está disponible.";

  if (error.code === "22023") {
    const msg = error.message ?? "";

    if (msg.includes("state changed concurrently")) {
      return "El torneo fue actualizado por otra persona. Recarga la información e inténtalo nuevamente.";
    }
    if (msg.includes("must have registration closed")) {
      return "Cierra las inscripciones antes de generar el cuadro.";
    }
    if (msg.includes("already has a generated bracket")) {
      return "Este torneo ya tiene un cuadro generado.";
    }
    if (msg.includes("does not match the tournament bracket size")) {
      return "La cantidad de parejas confirmadas no coincide con el tamaño del cuadro.";
    }
    if (msg.includes("does not match this tournament club or category")) {
      return "Una de las parejas confirmadas no corresponde a este torneo.";
    }
    if (msg.includes("does not have exactly two members")) {
      return "Una de las parejas confirmadas no tiene exactamente dos jugadores.";
    }
    if (msg.includes("Unsupported bracket size")) return "El tamaño del cuadro no es válido.";
    return "No fue posible generar el cuadro con los datos actuales.";
  }

  console.error("[tournamentBracket] RPC failed:", error);
  return "No fue posible generar el cuadro. Inténtalo nuevamente.";
}

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { supabase: null, error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return { supabase: null, error: "Sin permiso." };
  }

  return { supabase, error: null };
}

export async function generateTournamentBracketAction(
  clubId: string,
  tournamentId: string,
  revalidatePaths: string[]
): Promise<TournamentBracketActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("generate_tournament_bracket", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentBracketErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, tournament: data?.[0] };
}
