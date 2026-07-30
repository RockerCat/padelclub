"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { TournamentMatchRow } from "@/types/database";

export type TournamentLifecycleActionState = {
  success?: boolean;
  error?: string;
  match?: TournamentMatchRow;
};

// Lives in a neutral shared location (not under admin/tournaments), same
// reasoning as tournamentBracketActions.ts/tournamentSchedulingActions.ts —
// the shared MatchCard/BracketView components (used by both OWNER/ADMIN
// and PLAYER detail pages) never import across route boundaries. All 3
// actions here are OWNER/ADMIN-only in practice; the RPCs re-derive that
// authorization themselves regardless of which route rendered the
// trigger. Winner is never computed or sent here — record/correct only
// ever receive the raw set scores, exactly the real signatures
// (20260913000001).
//
// Every real code/message below comes directly from
// 20260913000001_tournament_match_lifecycle_functions.sql — never invented.

function tournamentLifecycleErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "No tienes permisos para realizar esta acción.";
  if (error.code === "P0002") {
    const msg = error.message ?? "";
    if (msg.includes("Tournament match")) return "El partido no existe o ya no está disponible.";
    return "El torneo no existe o ya no está disponible.";
  }

  if (error.code === "22023") {
    const msg = error.message ?? "";

    if (msg.includes("modified concurrently") || msg.includes("state changed concurrently")) {
      return "Esto fue actualizado por otra persona. Recarga la información e inténtalo nuevamente.";
    }
    if (msg.includes("not in a state that allows starting matches")) {
      return "El torneo no está en un estado que permita iniciar partidos.";
    }
    if (msg.includes("Only a scheduled match can be started")) {
      return "Solo un partido programado puede iniciarse.";
    }
    if (msg.includes("Tournament is not in progress")) {
      return "El torneo no está en curso.";
    }
    if (msg.includes("Only an in-progress match can have its result recorded")) {
      return "Solo un partido en juego puede registrar resultado.";
    }
    if (msg.includes("Only a completed match can be corrected")) {
      return "Solo un partido finalizado puede corregirse.";
    }
    if (msg.includes("final result cannot be corrected")) {
      return "El resultado de la final ya no puede corregirse.";
    }
    if (msg.includes("destination match has been scheduled or started")) {
      return "Ya no puedes corregir este resultado porque el siguiente partido ya fue programado o iniciado.";
    }
    if (msg.includes("destination match has downstream activity") || msg.includes("Destination match already has downstream activity")) {
      return "Ya no puedes corregir este resultado porque el siguiente partido ya tiene actividad.";
    }
    if (msg.includes("Destination slot is already filled")) {
      return "El cupo del siguiente partido ya está ocupado.";
    }
    if (msg.includes("Destination slot does not match the expected previous winner")) {
      return "No se pudo corregir: el siguiente partido ya no coincide con el ganador anterior.";
    }
    if (msg.includes("Destination match is not pending") || msg.includes("more than one destination")) {
      return "No es posible completar esta acción por el estado del siguiente partido.";
    }
    if (msg.includes("Winner cannot duplicate the opposite participant")) {
      return "No es posible completar esta acción por el estado del siguiente partido.";
    }
    if (msg.includes("Sets one and two are required")) {
      return "Completa el marcador de los sets 1 y 2.";
    }
    if (msg.includes("cannot be negative")) return "El marcador no puede tener valores negativos.";
    if (msg.includes("Set one cannot end tied")) return "El set 1 no puede terminar empatado.";
    if (msg.includes("Set two cannot end tied")) return "El set 2 no puede terminar empatado.";
    if (msg.includes("Set three cannot end tied")) return "El set 3 no puede terminar empatado.";
    if (msg.includes("Set three must be fully provided or fully omitted")) {
      return "El set 3 debe completarse por completo o dejarse vacío.";
    }
    if (msg.includes("two-set match must be won 2-0")) return "Un partido a dos sets debe ganarse 2-0.";
    if (msg.includes("third set is only valid")) {
      return "El set 3 solo es válido cuando cada pareja ganó uno de los dos primeros sets.";
    }
    if (msg.includes("score does not produce a winner")) return "El marcador no produce un ganador válido.";
    if (msg.includes("must be the final") || msg.includes("cannot be completed while other matches remain unfinished")) {
      return "No es posible completar el torneo todavía.";
    }
    return "Datos inválidos.";
  }

  console.error("[tournamentLifecycle] RPC failed:", error);
  return "No fue posible completar la acción. Inténtalo nuevamente.";
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

export async function startTournamentMatchAction(
  clubId: string,
  matchId: string,
  revalidatePaths: string[]
): Promise<TournamentLifecycleActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("start_tournament_match", {
    p_tournament_match_id: matchId,
  });

  if (error) return { error: tournamentLifecycleErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, match: data?.[0] };
}

interface MatchScoreParams {
  setOneEntryOne: number;
  setOneEntryTwo: number;
  setTwoEntryOne: number;
  setTwoEntryTwo: number;
  setThreeEntryOne: number | null;
  setThreeEntryTwo: number | null;
}

export async function recordTournamentMatchResultAction(
  clubId: string,
  matchId: string,
  score: MatchScoreParams,
  revalidatePaths: string[]
): Promise<TournamentLifecycleActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("record_tournament_match_result", {
    p_tournament_match_id: matchId,
    p_set_one_entry_one: score.setOneEntryOne,
    p_set_one_entry_two: score.setOneEntryTwo,
    p_set_two_entry_one: score.setTwoEntryOne,
    p_set_two_entry_two: score.setTwoEntryTwo,
    p_set_three_entry_one: score.setThreeEntryOne,
    p_set_three_entry_two: score.setThreeEntryTwo,
  });

  if (error) return { error: tournamentLifecycleErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, match: data?.[0] };
}

export async function correctTournamentMatchResultAction(
  clubId: string,
  matchId: string,
  score: MatchScoreParams,
  revalidatePaths: string[]
): Promise<TournamentLifecycleActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("correct_tournament_match_result", {
    p_tournament_match_id: matchId,
    p_set_one_entry_one: score.setOneEntryOne,
    p_set_one_entry_two: score.setOneEntryTwo,
    p_set_two_entry_one: score.setTwoEntryOne,
    p_set_two_entry_two: score.setTwoEntryTwo,
    p_set_three_entry_one: score.setThreeEntryOne,
    p_set_three_entry_two: score.setThreeEntryTwo,
  });

  if (error) return { error: tournamentLifecycleErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, match: data?.[0] };
}
