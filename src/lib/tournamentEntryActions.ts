"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { TournamentEntryRow } from "@/types/database";

export type TournamentEntryActionState = {
  success?: boolean;
  error?: string;
  entry?: TournamentEntryRow;
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
      return "Solo puedes registrar una pareja de la que formes parte.";
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
    if (msg.includes("has not opened yet")) {
      return "Las inscripciones de este torneo todavía no abren.";
    }
    if (msg.includes("registration window has closed")) {
      return "El plazo de inscripción de este torneo ya cerró.";
    }
    if (msg.includes("Both players are required")) return "Selecciona a los dos jugadores.";
    if (msg.includes("must be different")) return "Los dos jugadores deben ser distintos.";
    if (msg.includes("is not a member of this club")) return "Uno de los jugadores no pertenece a este club.";
    if (msg.includes("does not have an active membership")) return "Uno de los jugadores no tiene una membresía activa.";
    if (msg.includes("Only PLAYER memberships can register")) {
      return "Solo jugadores (rol PLAYER) pueden inscribirse en un torneo.";
    }
    if (msg.includes("already has an active entry") || msg.includes("already has another active entry")) {
      return "Uno de los jugadores ya tiene una inscripción activa en este torneo.";
    }
    if (msg.includes("reached its bracket size") || msg.includes("exceeded its bracket size")) {
      return "El torneo ya alcanzó su cupo máximo de parejas.";
    }
    if (msg.includes("Only a pending entry can be confirmed")) {
      return "Solo una inscripción pendiente puede confirmarse.";
    }
    if (msg.includes("Only a pending or confirmed entry can be withdrawn")) {
      return "Esta inscripción ya no puede retirarse.";
    }
    if (msg.includes("not in a state that allows withdrawal")) {
      return "El torneo ya no permite retirar inscripciones.";
    }
    if (msg.includes("no longer an active PLAYER member")) {
      return "Uno de los jugadores ya no es un miembro activo del club.";
    }
    if (msg.includes("does not have exactly two members")) {
      return "Esta inscripción no tiene exactamente dos jugadores.";
    }
    if (msg.includes("Invalid combined category pair")) {
      return "En este torneo no se permiten dos jugadores de la categoría superior.";
    }
    if (msg.includes("category is not allowed for this tournament")) {
      return "Uno de los jugadores no pertenece a una categoría válida para este torneo.";
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
