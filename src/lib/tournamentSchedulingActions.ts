"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { TournamentCourtAllocationRow, TournamentMatchRow } from "@/types/database";

export type TournamentAllocationActionState = {
  success?: boolean;
  error?: string;
  allocation?: TournamentCourtAllocationRow;
};

export type TournamentScheduleActionState = {
  success?: boolean;
  error?: string;
  match?: TournamentMatchRow;
};

// Lives in a neutral shared location (not under admin/tournaments), same
// reasoning as tournamentBracketActions.ts — the shared BracketView/
// MatchCard components (used by both OWNER/ADMIN and PLAYER detail pages)
// never import across route boundaries. All 4 actions here are OWNER/
// ADMIN-only in practice; the RPCs re-derive that authorization themselves
// regardless of which route rendered the trigger.
//
// Every real code/message below comes directly from
// 20260912000001_tournament_scheduling_functions.sql — never invented.

function tournamentSchedulingErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "No tienes permisos para realizar esta acción.";

  if (error.code === "P0002") {
    const msg = error.message ?? "";
    if (msg.includes("Court allocation")) return "La asignación de cancha no existe o ya no está disponible.";
    if (msg.includes("Court not found")) return "La cancha no existe o no está activa en este club.";
    if (msg.includes("Tournament match")) return "El partido no existe o ya no está disponible.";
    return "El torneo no existe o ya no está disponible.";
  }

  if (error.code === "22023") {
    const msg = error.message ?? "";

    if (msg.includes("modified concurrently")) {
      return "Esto fue actualizado por otra persona. Recarga la información e inténtalo nuevamente.";
    }
    if (msg.includes("not in a state that allows court allocations") || msg.includes("not in a state that allows editing court allocations")) {
      return "El torneo no está en un estado que permita gestionar canchas.";
    }
    if (msg.includes("not in a state that allows scheduling matches")) {
      return "El torneo no está en un estado que permita programar partidos.";
    }
    if (msg.includes("Court, date and time window are required") || msg.includes("Allocation, date and time window are required")) {
      return "Completa la cancha, la fecha y el horario.";
    }
    if (msg.includes("end_time must be after start_time") || msg.includes("scheduled_end_time must be after scheduled_start_time")) {
      return "La hora final debe ser posterior a la hora de inicio.";
    }
    if (msg.includes("Tournament schedule is not configured")) {
      return "El torneo no tiene fechas de inicio y fin configuradas.";
    }
    if (msg.includes("Allocation date is outside the tournament dates")) {
      return "La fecha está fuera del rango de fechas del torneo.";
    }
    if (msg.includes("overlaps another active allocation")) {
      return "Esta franja se superpone con otra asignación activa de esta cancha.";
    }
    if (msg.includes("overlaps an existing reservation")) {
      return "Esta franja se superpone con una reserva ya existente en esa cancha.";
    }
    if (msg.includes("is not active")) return "Esta asignación de cancha ya no está activa.";
    if (msg.includes("is already inactive")) return "Esta asignación ya está inactiva.";
    if (msg.includes("Cannot change the court while matches are scheduled")) {
      return "No puedes cambiar la cancha mientras haya partidos programados en esta asignación.";
    }
    if (msg.includes("Cannot change the date while matches are scheduled")) {
      return "No puedes cambiar la fecha mientras haya partidos programados en esta asignación.";
    }
    if (msg.includes("would leave an existing scheduled match outside the allocation")) {
      return "El nuevo horario dejaría fuera de rango a un partido ya programado en esta asignación.";
    }
    if (msg.includes("has matches referencing it and cannot be deactivated")) {
      return "Esta asignación tiene partidos programados y no puede desactivarse.";
    }
    if (msg.includes("Only a pending or scheduled match can be scheduled")) {
      return "Este partido ya no puede programarse.";
    }
    if (msg.includes("Match participants are not ready yet")) {
      return "Este partido todavía no tiene sus dos parejas definidas.";
    }
    if (msg.includes("Court allocation does not belong to this tournament")) {
      return "Esta asignación de cancha no pertenece a este torneo.";
    }
    if (msg.includes("Match date must match the allocation date")) {
      return "La fecha del partido debe coincidir con la de la asignación seleccionada.";
    }
    if (msg.includes("outside the allocation window")) {
      return "El horario debe estar dentro de la franja de la asignación seleccionada.";
    }
    if (msg.includes("conflicts with another tournament match")) {
      return "Ese horario choca con otro partido ya programado en esa cancha.";
    }
    if (msg.includes("conflicts with an existing reservation")) {
      return "Ese horario choca con una reserva ya existente en esa cancha.";
    }
    return "Datos inválidos.";
  }

  console.error("[tournamentScheduling] RPC failed:", error);
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

export async function createTournamentCourtAllocationAction(
  clubId: string,
  tournamentId: string,
  courtId: string,
  allocationDate: string,
  startTime: string,
  endTime: string,
  revalidatePaths: string[]
): Promise<TournamentAllocationActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  if (!courtId || !allocationDate || !startTime || !endTime) {
    return { error: "Completa la cancha, la fecha y el horario." };
  }

  const { data, error } = await supabase.rpc("create_tournament_court_allocation", {
    p_tournament_id: tournamentId,
    p_court_id: courtId,
    p_allocation_date: allocationDate,
    p_start_time: startTime,
    p_end_time: endTime,
  });

  if (error) return { error: tournamentSchedulingErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, allocation: data?.[0] };
}

export async function updateTournamentCourtAllocationAction(
  clubId: string,
  allocationId: string,
  courtId: string,
  allocationDate: string,
  startTime: string,
  endTime: string,
  revalidatePaths: string[]
): Promise<TournamentAllocationActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  if (!courtId || !allocationDate || !startTime || !endTime) {
    return { error: "Completa la cancha, la fecha y el horario." };
  }

  const { data, error } = await supabase.rpc("update_tournament_court_allocation", {
    p_tournament_court_allocation_id: allocationId,
    p_court_id: courtId,
    p_allocation_date: allocationDate,
    p_start_time: startTime,
    p_end_time: endTime,
  });

  if (error) return { error: tournamentSchedulingErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, allocation: data?.[0] };
}

export async function deactivateTournamentCourtAllocationAction(
  clubId: string,
  allocationId: string,
  revalidatePaths: string[]
): Promise<TournamentAllocationActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("deactivate_tournament_court_allocation", {
    p_tournament_court_allocation_id: allocationId,
  });

  if (error) return { error: tournamentSchedulingErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, allocation: data?.[0] };
}

export async function scheduleTournamentMatchAction(
  clubId: string,
  matchId: string,
  allocationId: string,
  scheduledDate: string,
  scheduledStartTime: string,
  scheduledEndTime: string,
  revalidatePaths: string[]
): Promise<TournamentScheduleActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  if (!allocationId || !scheduledDate || !scheduledStartTime || !scheduledEndTime) {
    return { error: "Completa la cancha, la fecha y el horario." };
  }

  const { data, error } = await supabase.rpc("schedule_tournament_match", {
    p_tournament_match_id: matchId,
    p_tournament_court_allocation_id: allocationId,
    p_scheduled_date: scheduledDate,
    p_scheduled_start_time: scheduledStartTime,
    p_scheduled_end_time: scheduledEndTime,
  });

  if (error) return { error: tournamentSchedulingErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, match: data?.[0] };
}
