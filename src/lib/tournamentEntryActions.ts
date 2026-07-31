"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { TournamentEntryRow } from "@/types/database";

export type TournamentEntryActionState = {
  success?: boolean;
  error?: string;
  entry?: TournamentEntryRow;
};

export type TournamentEntryMemberActionState = {
  success?: boolean;
  error?: string;
};

export type TournamentPointsActionState = {
  success?: boolean;
  error?: string;
  entries?: TournamentEntryRow[];
};

// Shared by OWNER/ADMIN (admin/tournaments) and PLAYER (tournaments) routes
// — same 3 RPCs, same error translation, never two versions of the same
// rule (CLAUDE.md → Shared View & Data Patterns). Every real code/message
// here comes directly from 20260910000001_tournament_entry_registration_
// functions.sql — never invented. Both callers pass the exact paths to
// revalidate since the admin and player detail pages live at different
// routes for the same tournament_id.

function tournamentEntryErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") {
    if (error.message?.includes("only register a pair they are part of")) {
      return "Solo puedes registrar una dupla de la que formes parte.";
    }
    if (error.message?.includes("only withdraw an entry they are part of")) {
      return "Solo puedes retirar una inscripción de la que formes parte.";
    }
    return "No tienes permisos para realizar esta acción.";
  }
  if (error.code === "P0002") {
    if (error.message?.includes("sport state")) return "Uno de los jugadores no tiene una categoría deportiva activa.";
    if (error.message?.includes("Tournament entry")) return "La inscripción no existe o ya no está disponible.";
    return "El torneo no existe o ya no está disponible.";
  }

  if (error.code === "22023") {
    const msg = error.message ?? "";

    if (msg.includes("modified concurrently")) {
      return "La inscripción fue actualizada por otra persona. Recarga la información e inténtalo nuevamente.";
    }
    if (msg.includes("registration is not open")) {
      return "Las inscripciones de este torneo no están abiertas.";
    }
    if (msg.includes("not accepting new pairs")) {
      return "Este torneo ya no acepta nuevas duplas.";
    }
    if (msg.includes("not accepting confirmations")) {
      return "Este torneo ya no acepta confirmaciones de inscripción.";
    }
    if (msg.includes("not in a state that allows rejection")) {
      return "Este torneo ya no permite rechazar solicitudes.";
    }
    if (msg.includes("A rejection reason is required")) {
      return "Escribe un motivo para el rechazo.";
    }
    if (msg.includes("Both players are required")) return "Selecciona a los dos jugadores.";
    if (msg.includes("must be different")) return "Los dos jugadores deben ser distintos.";
    if (msg.includes("is not an active PLAYER member of this club")) {
      return "Uno de los jugadores no es un miembro activo del club.";
    }
    if (msg.includes("Only PLAYER memberships can register")) {
      return "Solo jugadores (rol PLAYER) pueden inscribirse en un torneo.";
    }
    if (msg.includes("already has an active entry") || msg.includes("already has another active entry")) {
      return "Uno de los jugadores ya tiene una inscripción activa en este torneo.";
    }
    if (msg.includes("reached its maximum number of pairs")) {
      return "El torneo ya alcanzó su cupo máximo de duplas.";
    }
    if (msg.includes("Only a pending entry can be confirmed")) {
      return "Solo una inscripción pendiente puede confirmarse.";
    }
    if (msg.includes("Only a pending entry can be rejected")) {
      return "Solo una inscripción pendiente puede rechazarse.";
    }
    if (msg.includes("Only a pending or confirmed entry can be withdrawn")) {
      return "Esta inscripción ya no puede retirarse.";
    }
    if (msg.includes("not in a state that allows withdrawal")) {
      return "El torneo ya no permite retirar inscripciones.";
    }
    if (msg.includes("does not have exactly two active members")) {
      return "Esta inscripción no tiene exactamente dos jugadores activos.";
    }
    if (msg.includes("Invalid combined category pair")) {
      return "En este torneo no se permiten dos jugadores de la categoría superior.";
    }
    if (msg.includes("category is not allowed for this tournament")) {
      return "Uno de los jugadores no pertenece a una categoría válida para este torneo.";
    }
    if (msg.includes("Both the outgoing and incoming players are required")) {
      return "Selecciona al jugador que sale y al que entra.";
    }
    if (msg.includes("incoming player must be different from the outgoing player")) {
      return "El jugador entrante debe ser distinto del saliente.";
    }
    if (msg.includes("Only a confirmed entry can have its members replaced")) {
      return "Solo una dupla confirmada puede reemplazar integrantes.";
    }
    if (msg.includes("Members can only be replaced while the tournament is in progress")) {
      return "Los integrantes solo pueden reemplazarse mientras el torneo está en curso.";
    }
    if (msg.includes("outgoing player is not an active member of this entry")) {
      return "El jugador seleccionado ya no es integrante activo de esta dupla.";
    }
    if (msg.includes("Incoming player is not an active PLAYER member")) {
      return "El jugador entrante no es un miembro activo del club.";
    }
    if (msg.includes("incoming player already has an active entry")) {
      return "El jugador entrante ya tiene una inscripción activa en este torneo.";
    }
    if (msg.includes("Incoming player category is not allowed")) {
      return "El jugador entrante no pertenece a una categoría válida para este torneo.";
    }
    if (msg.includes("Outgoing player was modified concurrently")) {
      return "Esta dupla fue modificada por otra persona. Recarga la información e inténtalo nuevamente.";
    }
    if (msg.includes("Tournament is not in progress")) {
      return "Esta acción solo está disponible mientras el torneo está en curso.";
    }
    if (msg.includes("No entries provided")) {
      return "No hay duplas para actualizar.";
    }
    if (msg.includes("Points must be non-negative integers")) {
      return "Los puntos deben ser números enteros no negativos.";
    }
    if (msg.includes("All entries must be confirmed entries of this tournament")) {
      return "Solo se pueden editar los puntos de duplas confirmadas de este torneo.";
    }
    if (msg.includes("Not authorized to edit points")) {
      return "No tienes permisos para editar los puntos de este torneo.";
    }
    return "Datos inválidos.";
  }

  console.error("[tournamentEntries] RPC failed:", error);
  return "No fue posible completar la acción. Inténtalo de nuevo.";
}

async function requireActiveMember(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { supabase: null, error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) return { supabase: null, error: "Sin permiso." };

  return { supabase, error: null };
}

export async function registerTournamentEntryAction(
  clubId: string,
  tournamentId: string,
  clubMemberOneId: string,
  clubMemberTwoId: string,
  revalidatePaths: string[]
): Promise<TournamentEntryActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  if (!clubMemberOneId || !clubMemberTwoId) return { error: "Selecciona a los dos jugadores." };
  if (clubMemberOneId === clubMemberTwoId) return { error: "Los dos jugadores deben ser distintos." };

  const { data, error } = await supabase.rpc("register_tournament_entry", {
    p_tournament_id: tournamentId,
    p_club_member_one_id: clubMemberOneId,
    p_club_member_two_id: clubMemberTwoId,
  });

  if (error) return { error: tournamentEntryErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: data?.[0] };
}

export async function confirmTournamentEntryAction(
  clubId: string,
  tournamentEntryId: string,
  revalidatePaths: string[]
): Promise<TournamentEntryActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("confirm_tournament_entry", {
    p_tournament_entry_id: tournamentEntryId,
  });

  if (error) return { error: tournamentEntryErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: data?.[0] };
}

export async function rejectTournamentEntryAction(
  clubId: string,
  tournamentEntryId: string,
  reason: string,
  revalidatePaths: string[]
): Promise<TournamentEntryActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("reject_tournament_entry", {
    p_tournament_entry_id: tournamentEntryId,
    p_reason: reason,
  });

  if (error) return { error: tournamentEntryErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: data?.[0] };
}

export async function withdrawTournamentEntryAction(
  clubId: string,
  tournamentEntryId: string,
  revalidatePaths: string[]
): Promise<TournamentEntryActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("withdraw_tournament_entry", {
    p_tournament_entry_id: tournamentEntryId,
  });

  if (error) return { error: tournamentEntryErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: data?.[0] };
}

// Reemplazo/corrección de integrante — misma operación mecánica para
// ambos casos (ver CLAUDE.md → Tournament Module Principles), solo sobre
// una pareja confirmada, solo mientras el torneo está in_progress. Nunca
// expone historial/auditoría al organizador — el resultado visible es
// simplemente "el jugador cambió", los puntos de la pareja no se tocan
// (viven en tournament_entries, no en tournament_entry_members).
export async function replaceTournamentEntryMemberAction(
  clubId: string,
  tournamentEntryId: string,
  oldClubMemberId: string,
  newClubMemberId: string,
  revalidatePaths: string[]
): Promise<TournamentEntryMemberActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  if (!oldClubMemberId || !newClubMemberId) return { error: "Selecciona al jugador entrante." };
  if (oldClubMemberId === newClubMemberId) return { error: "El jugador entrante debe ser distinto del saliente." };

  const { error } = await supabase.rpc("replace_tournament_entry_member", {
    p_tournament_entry_id: tournamentEntryId,
    p_old_club_member_id: oldClubMemberId,
    p_new_club_member_id: newClubMemberId,
  });

  if (error) return { error: tournamentEntryErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true };
}

// Edición en bloque de la clasificación — un único botón "Guardar puntos",
// atómica (una sola llamada RPC para todas las filas modificadas). Solo
// mientras el torneo está in_progress.
export async function setTournamentEntryPointsAction(
  clubId: string,
  tournamentId: string,
  entries: { entryId: string; points: number }[],
  revalidatePaths: string[]
): Promise<TournamentPointsActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  if (entries.length === 0) return { success: true, entries: [] };

  const { data, error } = await supabase.rpc("set_tournament_entry_points", {
    p_tournament_id: tournamentId,
    p_entry_ids: entries.map((e) => e.entryId),
    p_points: entries.map((e) => e.points),
  });

  if (error) return { error: tournamentEntryErrorMessage(error) };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entries: data ?? [] };
}
