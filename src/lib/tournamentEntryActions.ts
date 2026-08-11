"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { TournamentEntryRow } from "@/types/database";
import {
  registerTournamentEntry,
  confirmTournamentEntry,
  rejectTournamentEntry,
  withdrawTournamentEntry,
  replaceTournamentEntryMember,
  setTournamentEntryPoints,
} from "../../shared/tournaments/entryActions";

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

// El cómputo real (RPC + traducción de errores) ya NO vive aquí — está en
// shared/tournaments/entryActions.ts, la misma fuente que mobile llama
// directo. Esta Server Action solo aporta lo específico de Next.js:
// requireActiveMember (sesión + membresía activa vía cookies) y
// revalidatePath después de una mutación exitosa — RLS/el propio RPC
// siguen siendo la autoridad real de todas formas.

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

  const { entry, error } = await registerTournamentEntry(supabase, tournamentId, clubMemberOneId, clubMemberTwoId);
  if (error) return { error };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: entry ?? undefined };
}

export async function confirmTournamentEntryAction(
  clubId: string,
  tournamentEntryId: string,
  revalidatePaths: string[]
): Promise<TournamentEntryActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { entry, error } = await confirmTournamentEntry(supabase, tournamentEntryId);
  if (error) return { error };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: entry ?? undefined };
}

export async function rejectTournamentEntryAction(
  clubId: string,
  tournamentEntryId: string,
  reason: string,
  revalidatePaths: string[]
): Promise<TournamentEntryActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { entry, error } = await rejectTournamentEntry(supabase, tournamentEntryId, reason);
  if (error) return { error };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: entry ?? undefined };
}

export async function withdrawTournamentEntryAction(
  clubId: string,
  tournamentEntryId: string,
  revalidatePaths: string[]
): Promise<TournamentEntryActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { entry, error } = await withdrawTournamentEntry(supabase, tournamentEntryId);
  if (error) return { error };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entry: entry ?? undefined };
}

// Reemplazo/corrección de integrante — misma operación mecánica para
// ambos casos (ver CLAUDE.md → Tournament Module Principles), solo sobre
// una pareja confirmada, solo mientras el torneo está in_progress.
export async function replaceTournamentEntryMemberAction(
  clubId: string,
  tournamentEntryId: string,
  oldClubMemberId: string,
  newClubMemberId: string,
  revalidatePaths: string[]
): Promise<TournamentEntryMemberActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { success, error } = await replaceTournamentEntryMember(supabase, tournamentEntryId, oldClubMemberId, newClubMemberId);
  if (!success) return { error: error! };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true };
}

// Edición en bloque de la clasificación — un único botón "Guardar
// puntos", atómica (una sola llamada RPC para todas las filas
// modificadas). Solo mientras el torneo está in_progress.
export async function setTournamentEntryPointsAction(
  clubId: string,
  tournamentId: string,
  entries: { entryId: string; points: number }[],
  revalidatePaths: string[]
): Promise<TournamentPointsActionState> {
  const { supabase, error: authError } = await requireActiveMember(clubId);
  if (authError || !supabase) return { error: authError! };

  const { entries: updated, error } = await setTournamentEntryPoints(supabase, tournamentId, entries);
  if (error) return { error };

  for (const path of revalidatePaths) revalidatePath(path);
  return { success: true, entries: updated };
}
