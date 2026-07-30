"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type TournamentAwardActionState = {
  success?: boolean;
  error?: string;
  alreadyAwarded?: boolean;
};

// Lives in a neutral shared location (not under admin/tournaments), same
// reasoning as tournamentBracketActions.ts/tournamentLifecycleActions.ts —
// the shared TournamentAwardsSection component (used by both OWNER/ADMIN
// and PLAYER detail pages) never imports across route boundaries. This
// action is OWNER/ADMIN-only in practice; award_tournament_points
// re-derives that authorization itself regardless of which route rendered
// the trigger (audited, 20260914000001 — explicit role IN ('OWNER','ADMIN')
// check after the active-membership lookup).
//
// This action calls exclusively award_tournament_points — no club_member_id,
// entry_id, winner, position, or delta is ever sent; the RPC computes and
// writes everything itself. The detailed points summary is never built from
// this RPC's aggregate counts — TournamentAwardsSection always re-reads
// get_tournament_points_summary after a router.refresh() for that.
//
// Every real code/message below comes directly from
// 20260914000001_award_tournament_points_function.sql — never invented.

function tournamentAwardErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "No tienes permisos para asignar los puntos de este torneo.";

  if (error.code === "P0002") {
    const msg = error.message ?? "";
    if (msg.includes("Player has no sport state")) {
      return "Uno de los jugadores no tiene un estado deportivo válido para recibir puntos.";
    }
    return "El torneo no existe o ya no está disponible.";
  }

  if (error.code === "22023") {
    const msg = error.message ?? "";

    if (msg.includes("Tournament is not completed")) {
      return "El torneo debe estar finalizado antes de asignar los puntos.";
    }
    if (msg.includes("partial or inconsistent state")) {
      return "Se detectó una asignación incompleta de puntos. Revisa el estado del torneo antes de continuar.";
    }
    if (
      msg.includes("does not have the expected number of matches") ||
      msg.includes("Not all tournament matches are completed") ||
      msg.includes("does not have exactly one final") ||
      msg.includes("does not belong to the last round") ||
      msg.includes("missing its source matches") ||
      msg.includes("does not match the tournament bracket size") ||
      msg.includes("does not match the confirmed entries exactly") ||
      msg.includes("does not have exactly two members") ||
      msg.includes("appears in more than one confirmed entry")
    ) {
      return "No fue posible validar las posiciones finales del torneo.";
    }
    return "No fue posible asignar los puntos del torneo.";
  }

  console.error("[tournamentAward] RPC failed:", error);
  return "No fue posible asignar los puntos del torneo.";
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

export async function awardTournamentPointsAction(
  clubId: string,
  tournamentId: string,
  revalidatePaths: string[]
): Promise<TournamentAwardActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("award_tournament_points", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentAwardErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, alreadyAwarded: data?.[0]?.already_awarded ?? false };
}
