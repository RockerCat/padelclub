"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bogotaWallClockToISO } from "@/lib/utils/bogotaDatetime";
import { resolveClubAccess } from "@/lib/clubAccess";
import {
  type CreateTournamentFields,
  createTournament as sharedCreateTournament,
  updateTournament as sharedUpdateTournament,
  updateTournamentCoverImage as sharedUpdateTournamentCoverImage,
  runTournamentTransition,
} from "../../../../../../shared/tournaments/actions";
import type { Tournament } from "@/types/database";

// El cómputo real (validación + los 11 RPCs de nivel torneo: create/
// update/cover + las 8 transiciones de ciclo de vida) ya NO vive aquí —
// está en shared/tournaments/actions.ts, la misma fuente que mobile
// llama directo. Este archivo solo aporta lo específico de Next.js:
// requireAdminRole (sesión + rol vía cookies), el parseo de FormData (los
// inputs del formulario nunca llegan como objeto plano) y revalidatePath
// después de cada mutación exitosa.

export type TournamentActionState = {
  success?: boolean;
  error?: string;
  tournament?: Tournament;
};

export type TournamentFinalizeState = {
  success?: boolean;
  error?: string;
  alreadyFinalized?: boolean;
};

// ─── Shared permission guard ─────────────────────────────────────────────────
// Mirrors requireAdminRole in courts/players actions.ts — the RPCs themselves
// re-derive OWNER/ADMIN authorization independently; this is only so the
// client gets "No autenticado."/"Sin permiso." without a round trip to
// Postgres for an obviously-unauthorized caller.

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);

  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { supabase: null, error: access.authorized ? "Sin permiso." : access.error };
  }

  return { supabase, error: null };
}

// ─── FormData parsing (específico de Next.js) ────────────────────────────────
// Solo extrae/convierte los campos del formulario a la forma que
// shared/tournaments/actions.ts espera — la validación de esos campos
// (obligatorios, rangos, combinaciones válidas) vive en
// validateCreateTournamentFields, llamada internamente por
// createTournament/updateTournament (shared), nunca duplicada aquí.

function parseTournamentFields(formData: FormData): CreateTournamentFields {
  return {
    name: (formData.get("name") as string | null)?.trim() ?? "",
    description: (formData.get("description") as string | null)?.trim() || null,
    category: (formData.get("category") as string | null) ?? "",
    secondaryCategory: (formData.get("secondary_category") as string | null) || null,
    maxPairs: (() => {
      const raw = formData.get("max_pairs") as string | null;
      return raw ? parseInt(raw, 10) : NaN;
    })(),
    visibility: (formData.get("visibility") as string | null) ?? "private",
    registrationOpensAt: bogotaWallClockToISO((formData.get("registration_opens_at") as string | null) ?? ""),
    registrationClosesAt: bogotaWallClockToISO((formData.get("registration_closes_at") as string | null) ?? ""),
    startsAt: bogotaWallClockToISO((formData.get("starts_at") as string | null) ?? ""),
    estimatedDurationMinutes: (() => {
      const raw = formData.get("estimated_duration_minutes") as string | null;
      return raw ? parseInt(raw, 10) : NaN;
    })(),
    prizeDescription: (formData.get("prize_description") as string | null)?.trim() || null,
    coverImageUrl: (formData.get("cover_image_url") as string | null)?.trim() || null,
    entryFeeAmount: (() => {
      const raw = formData.get("entry_fee_amount") as string | null;
      return raw ? parseInt(raw, 10) : 0;
    })(),
  };
}

// ─── createTournament ─────────────────────────────────────────────────────────

export async function createTournament(
  clubId: string,
  clubSlug: string,
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { tournament, error } = await sharedCreateTournament(supabase, clubId, parseTournamentFields(formData));
  if (error) return { error };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  return { success: true, tournament: tournament ?? undefined };
}

// ─── updateTournament ─────────────────────────────────────────────────────────

export async function updateTournament(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string,
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { tournament, error } = await sharedUpdateTournament(supabase, tournamentId, parseTournamentFields(formData));
  if (error) return { error };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/tournaments/${tournamentSlug}`);
  return { success: true, tournament: tournament ?? undefined };
}

// ─── updateTournamentCoverImage ────────────────────────────────────────────────
// Única propiedad editable en cualquier estado del torneo (draft,
// registration_open, registration_closed, in_progress, completed,
// cancelled) — nunca reabre el torneo, nunca toca ningún otro campo.
// RPC dedicado (update_tournament_cover_image), separado a propósito de
// update_tournament, que sigue exactamente igual de bloqueado fuera de
// draft/registration_open/registration_closed para todo lo demás.

export async function updateTournamentCoverImage(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string,
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const coverImageUrl = (formData.get("cover_image_url") as string | null)?.trim() || null;
  const { tournament, error } = await sharedUpdateTournamentCoverImage(supabase, tournamentId, coverImageUrl);
  if (error) return { error };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/tournaments/${tournamentSlug}`);
  return { success: true, tournament: tournament ?? undefined };
}

// ─── Transiciones de ciclo de vida ───────────────────────────────────────────
// Las 8 comparten la misma forma exacta: requireAdminRole → shared
// runTournamentTransition → revalidatePath. tournamentErrorMessage y el
// logueo de errores ya viven una sola vez dentro de runTournamentTransition
// (shared), no repetidos por función como antes.

async function transition(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string,
  key: Parameters<typeof runTournamentTransition>[1]
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { tournament, error } = await runTournamentTransition(supabase, key, tournamentId);
  if (error) return { error };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/tournaments/${tournamentSlug}`);
  return { success: true, tournament: tournament ?? undefined };
}

export async function openTournamentRegistration(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentActionState> {
  return transition(clubId, tournamentId, tournamentSlug, clubSlug, "open");
}

export async function closeTournamentRegistration(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentActionState> {
  return transition(clubId, tournamentId, tournamentSlug, clubSlug, "close");
}

export async function reopenTournamentRegistration(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentActionState> {
  return transition(clubId, tournamentId, tournamentSlug, clubSlug, "reopen");
}

export async function cancelTournament(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentActionState> {
  return transition(clubId, tournamentId, tournamentSlug, clubSlug, "cancel");
}

// registration_closed → in_progress. El botón explícito "Iniciar torneo".
export async function startTournament(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentActionState> {
  return transition(clubId, tournamentId, tournamentSlug, clubSlug, "start");
}

// Only a completed or cancelled tournament can be archived — never touches
// status, entries, points, classification or news, purely a visibility
// toggle for the admin listing (archived_at/archived_by).
export async function archiveTournament(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentActionState> {
  return transition(clubId, tournamentId, tournamentSlug, clubSlug, "archive");
}

// Clears archived_at/archived_by only — status is never touched, so the
// tournament reappears exactly in the tab its unchanged status already
// maps to (Finalizados o Cancelados).
export async function restoreTournament(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentActionState> {
  return transition(clubId, tournamentId, tournamentSlug, clubSlug, "restore");
}

// ─── finalizeTournament ─────────────────────────────────────────────────────────
// in_progress → completed. Congela la clasificación y aplica los puntos al
// ranking de cada integrante final, en partes iguales. Idempotente — el
// único caso donde el estado devuelto es alreadyFinalized en vez de la
// fila del torneo (finalize_tournament no la retorna, ver
// runTournamentTransition en shared).

export async function finalizeTournament(
  clubId: string,
  tournamentId: string,
  tournamentSlug: string,
  clubSlug: string
): Promise<TournamentFinalizeState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { alreadyFinalized, error } = await runTournamentTransition(supabase, "finalize", tournamentId);
  if (error) return { error };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/tournaments/${tournamentSlug}`);
  return { success: true, alreadyFinalized };
}
