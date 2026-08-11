import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { TournamentEntryRow } from "../types/domain";

// Portado de src/lib/tournamentEntryActions.ts (app web) — mismos 6 RPCs
// exactos, misma traducción código/mensaje→texto en español. Cada
// mensaje/condición viene directamente de
// 20260910000001_tournament_entry_registration_functions.sql — nunca
// inventado. La app web envuelve estas mismas funciones con
// requireActiveMember (sesión + membresía activa, específico de
// Next.js/cookies) y revalidatePath después de una mutación exitosa —
// ninguna de las dos cosas es lógica de negocio pura, así que ambas se
// quedan en la Server Action de WEB; mobile llama estas funciones
// directo, con RLS como la autoridad real (mismo patrón ya establecido en
// el resto de mutaciones portadas de este proyecto).
//
// Nota de consolidación: la copia anterior de este mapeo en mobile tenía
// varias condiciones `msg.includes(...)` que NO coincidían con el texto
// real que las funciones SQL lanzan (reconstruidas a mano en vez de
// copiadas literalmente) — por ejemplo comparaba con "no longer
// accepting"/"superior category"/mayúsculas distintas que nunca
// aparecían en el mensaje real, cayendo siempre al mensaje genérico
// "Datos inválidos." en esos casos. Esta es ahora la única fuente, con
// las condiciones exactas verificadas contra el archivo real de WEB.
export function tournamentEntryErrorMessage(error: { code?: string; message?: string }): string {
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

  return "No fue posible completar la acción. Inténtalo de nuevo.";
}

type EntryResult = { entry: TournamentEntryRow | null; error: string | null };

export async function registerTournamentEntry(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  memberOneId: string,
  memberTwoId: string
): Promise<EntryResult> {
  if (!memberOneId || !memberTwoId) return { entry: null, error: "Selecciona a los dos jugadores." };
  if (memberOneId === memberTwoId) return { entry: null, error: "Los dos jugadores deben ser distintos." };

  const { data, error } = await supabase.rpc("register_tournament_entry", {
    p_tournament_id: tournamentId,
    p_club_member_one_id: memberOneId,
    p_club_member_two_id: memberTwoId,
  });
  if (error) return { entry: null, error: tournamentEntryErrorMessage(error) };
  return { entry: (data?.[0] as TournamentEntryRow | undefined) ?? null, error: null };
}

export async function confirmTournamentEntry(supabase: SupabaseClient<Database>, entryId: string): Promise<EntryResult> {
  const { data, error } = await supabase.rpc("confirm_tournament_entry", { p_tournament_entry_id: entryId });
  if (error) return { entry: null, error: tournamentEntryErrorMessage(error) };
  return { entry: (data?.[0] as TournamentEntryRow | undefined) ?? null, error: null };
}

export async function rejectTournamentEntry(
  supabase: SupabaseClient<Database>,
  entryId: string,
  reason: string
): Promise<EntryResult> {
  if (!reason.trim()) return { entry: null, error: "Escribe un motivo para el rechazo." };
  const { data, error } = await supabase.rpc("reject_tournament_entry", {
    p_tournament_entry_id: entryId,
    p_reason: reason.trim(),
  });
  if (error) return { entry: null, error: tournamentEntryErrorMessage(error) };
  return { entry: (data?.[0] as TournamentEntryRow | undefined) ?? null, error: null };
}

export async function withdrawTournamentEntry(supabase: SupabaseClient<Database>, entryId: string): Promise<EntryResult> {
  const { data, error } = await supabase.rpc("withdraw_tournament_entry", { p_tournament_entry_id: entryId });
  if (error) return { entry: null, error: tournamentEntryErrorMessage(error) };
  return { entry: (data?.[0] as TournamentEntryRow | undefined) ?? null, error: null };
}

// Reemplazo/corrección de integrante — misma operación mecánica para
// ambos casos, solo sobre una pareja confirmada, solo mientras el torneo
// está in_progress. Nunca expone historial/auditoría al organizador — el
// resultado visible es simplemente "el jugador cambió", los puntos de la
// pareja no se tocan (viven en tournament_entries, no en
// tournament_entry_members). La validación de "distinto del saliente" no
// hace falta aquí como chequeo de negatividad explícito porque el propio
// caller (ReplaceMemberModal en ambas plataformas) ya excluye a los
// integrantes actuales de la lista de candidatos entrantes — la RPC sigue
// siendo la autoridad real de todas formas.
export async function replaceTournamentEntryMember(
  supabase: SupabaseClient<Database>,
  entryId: string,
  oldMemberId: string,
  newMemberId: string
): Promise<{ success: boolean; error: string | null }> {
  if (!oldMemberId) return { success: false, error: "Selecciona qué jugador sale de la dupla." };
  if (!newMemberId) return { success: false, error: "Selecciona al jugador que entra." };
  const { error } = await supabase.rpc("replace_tournament_entry_member", {
    p_tournament_entry_id: entryId,
    p_old_club_member_id: oldMemberId,
    p_new_club_member_id: newMemberId,
  });
  if (error) return { success: false, error: tournamentEntryErrorMessage(error) };
  return { success: true, error: null };
}

// Edición en bloque de la clasificación — un único botón "Guardar
// puntos", atómica (una sola llamada RPC para todas las filas
// modificadas). Solo mientras el torneo está in_progress.
export async function setTournamentEntryPoints(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  entries: { entryId: string; points: number }[]
): Promise<{ entries: TournamentEntryRow[]; error: string | null }> {
  if (entries.length === 0) return { entries: [], error: null };
  const { data, error } = await supabase.rpc("set_tournament_entry_points", {
    p_tournament_id: tournamentId,
    p_entry_ids: entries.map((e) => e.entryId),
    p_points: entries.map((e) => e.points),
  });
  if (error) return { entries: [], error: tournamentEntryErrorMessage(error) };
  return { entries: (data as TournamentEntryRow[] | null) ?? [], error: null };
}
