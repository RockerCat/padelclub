"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bogotaWallClockToISO } from "@/lib/utils/bogotaDatetime";
import type { Tournament } from "@/types/database";

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

const VISIBILITIES = ["public", "private"];

// ─── Shared permission guard ─────────────────────────────────────────────────
// Mirrors requireAdminRole in courts/players actions.ts — the RPCs themselves
// re-derive OWNER/ADMIN authorization independently; this is only so the
// client gets "No autenticado."/"Sin permiso." without a round trip to
// Postgres for an obviously-unauthorized caller.

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase: null, error: "No autenticado." };
  }

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

// ─── Shared error translation ────────────────────────────────────────────────
// Every real code/message here comes directly from the tournament lifecycle
// RPCs (núcleo reconstruido) — never invented.

function tournamentErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "No tienes permisos para realizar esta acción.";
  if (error.code === "P0002") return "El torneo no existe o ya no está disponible.";
  if (error.code === "P0005") return "Este club se encuentra archivado.";

  if (error.code === "22023") {
    const msg = error.message ?? "";

    if (msg.includes("modified concurrently") || msg.includes("changed concurrently")) {
      return "El torneo fue actualizado por otra persona. Recarga la información e inténtalo nuevamente.";
    }
    if (
      msg.includes("not in an editable state") ||
      msg.includes("no longer in draft") ||
      msg.includes("Only a draft tournament") ||
      msg.includes("Only a tournament with open registration") ||
      msg.includes("Only a tournament with closed registration") ||
      msg.includes("cannot be cancelled in its current state") ||
      msg.includes("registration is no longer open") ||
      msg.includes("registration is no longer closed")
    ) {
      return "El torneo cambió de estado y esta acción ya no está disponible.";
    }
    if (msg.includes("cannot change once registration is open")) {
      return "Este campo ya no puede modificarse porque las inscripciones están abiertas.";
    }
    if (msg.includes("name cannot be blank")) return "El nombre del torneo es obligatorio.";
    if (msg.includes("Invalid tournament category combination")) {
      return "La combinación de categorías no es válida: la categoría principal debe ser superior a la secundaria.";
    }
    if (msg.includes("Invalid category")) return "Selecciona una categoría válida.";
    if (msg.includes("Invalid max pairs")) return "El número máximo de parejas debe ser mayor a cero.";
    if (msg.includes("Invalid visibility")) return "Selecciona una visibilidad válida.";
    if (msg.includes("registration_opens_at must be before registration_closes_at")) {
      return "La apertura de inscripciones debe ser anterior a su cierre.";
    }
    if (msg.includes("starts_at must not be after ends_at")) {
      return "La fecha de inicio no puede ser posterior a la de finalización.";
    }
    if (msg.includes("registration_closes_at must not be after starts_at")) {
      return "El cierre de inscripciones no puede ser posterior al inicio del torneo.";
    }
    if (msg.includes("schedule is not fully configured")) {
      return "Completa todas las fechas del torneo (inscripción e inicio/fin) antes de abrir las inscripciones.";
    }
    if (msg.includes("needs at least one confirmed pair to start")) {
      return "El torneo necesita al menos una pareja confirmada para iniciar.";
    }
    if (msg.includes("has no confirmed entries")) {
      return "El torneo no tiene parejas confirmadas.";
    }
    if (msg.includes("inconsistent state")) {
      return "Los puntos de este torneo están en un estado inconsistente. Contacta a soporte.";
    }
    return "Datos inválidos.";
  }

  console.error("[tournaments] RPC failed:", error);
  return "No fue posible completar la acción. Inténtalo de nuevo.";
}

// ─── Shared field parsing ────────────────────────────────────────────────────

function parseTournamentFields(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const category = (formData.get("category") as string | null) ?? "";
  const secondaryCategoryRaw = (formData.get("secondary_category") as string | null) ?? "";
  const secondaryCategory = secondaryCategoryRaw || null;
  const maxPairsRaw = formData.get("max_pairs") as string | null;
  const maxPairs = maxPairsRaw ? parseInt(maxPairsRaw, 10) : NaN;
  const visibility = (formData.get("visibility") as string | null) ?? "private";
  const registrationOpensAt = bogotaWallClockToISO((formData.get("registration_opens_at") as string | null) ?? "");
  const registrationClosesAt = bogotaWallClockToISO((formData.get("registration_closes_at") as string | null) ?? "");
  const startsAt = bogotaWallClockToISO((formData.get("starts_at") as string | null) ?? "");
  const endsAt = bogotaWallClockToISO((formData.get("ends_at") as string | null) ?? "");
  const prizeDescription = (formData.get("prize_description") as string | null)?.trim() || null;
  const coverImageUrl = (formData.get("cover_image_url") as string | null)?.trim() || null;

  if (!name) return { error: "El nombre del torneo es obligatorio." } as const;
  if (!category) return { error: "Selecciona una categoría." } as const;
  if (secondaryCategory && secondaryCategory === category) {
    return { error: "La categoría secundaria debe ser distinta de la principal." } as const;
  }
  if (!Number.isInteger(maxPairs) || maxPairs < 1) {
    return { error: "El número máximo de parejas debe ser mayor a cero." } as const;
  }
  if (!VISIBILITIES.includes(visibility)) return { error: "Selecciona una visibilidad válida." } as const;
  if (registrationOpensAt && registrationClosesAt && registrationOpensAt >= registrationClosesAt) {
    return { error: "La apertura de inscripciones debe ser anterior a su cierre." } as const;
  }
  if (startsAt && endsAt && startsAt > endsAt) {
    return { error: "La fecha de inicio no puede ser posterior a la de finalización." } as const;
  }
  if (registrationClosesAt && startsAt && registrationClosesAt > startsAt) {
    return { error: "El cierre de inscripciones no puede ser posterior al inicio del torneo." } as const;
  }

  return {
    value: {
      name,
      description,
      category,
      secondaryCategory,
      maxPairs,
      visibility,
      registrationOpensAt,
      registrationClosesAt,
      startsAt,
      endsAt,
      prizeDescription,
      coverImageUrl,
    },
  } as const;
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

  const parsed = parseTournamentFields(formData);
  if ("error" in parsed) return { error: parsed.error };
  const f = parsed.value;

  const { data, error } = await supabase.rpc("create_tournament", {
    p_club_id: clubId,
    p_name: f.name,
    p_category: f.category,
    p_max_pairs: f.maxPairs,
    p_description: f.description,
    p_visibility: f.visibility,
    p_registration_opens_at: f.registrationOpensAt,
    p_registration_closes_at: f.registrationClosesAt,
    p_starts_at: f.startsAt,
    p_ends_at: f.endsAt,
    p_secondary_category: f.secondaryCategory,
    p_prize_description: f.prizeDescription,
    p_cover_image_url: f.coverImageUrl,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  return { success: true, tournament: data?.[0] };
}

// ─── updateTournament ─────────────────────────────────────────────────────────

export async function updateTournament(
  clubId: string,
  tournamentId: string,
  clubSlug: string,
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const parsed = parseTournamentFields(formData);
  if ("error" in parsed) return { error: parsed.error };
  const f = parsed.value;

  const { data, error } = await supabase.rpc("update_tournament", {
    p_tournament_id: tournamentId,
    p_name: f.name,
    p_description: f.description,
    p_category: f.category,
    p_max_pairs: f.maxPairs,
    p_visibility: f.visibility,
    p_registration_opens_at: f.registrationOpensAt,
    p_registration_closes_at: f.registrationClosesAt,
    p_starts_at: f.startsAt,
    p_ends_at: f.endsAt,
    p_secondary_category: f.secondaryCategory,
    p_prize_description: f.prizeDescription,
    p_cover_image_url: f.coverImageUrl,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/admin/tournaments/${tournamentId}`);
  return { success: true, tournament: data?.[0] };
}

// ─── openTournamentRegistration ───────────────────────────────────────────────

export async function openTournamentRegistration(
  clubId: string,
  tournamentId: string,
  clubSlug: string
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("open_tournament_registration", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/admin/tournaments/${tournamentId}`);
  return { success: true, tournament: data?.[0] };
}

// ─── closeTournamentRegistration ──────────────────────────────────────────────

export async function closeTournamentRegistration(
  clubId: string,
  tournamentId: string,
  clubSlug: string
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("close_tournament_registration", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/admin/tournaments/${tournamentId}`);
  return { success: true, tournament: data?.[0] };
}

// ─── reopenTournamentRegistration ─────────────────────────────────────────────

export async function reopenTournamentRegistration(
  clubId: string,
  tournamentId: string,
  clubSlug: string
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("reopen_tournament_registration", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/admin/tournaments/${tournamentId}`);
  return { success: true, tournament: data?.[0] };
}

// ─── cancelTournament ──────────────────────────────────────────────────────────

export async function cancelTournament(
  clubId: string,
  tournamentId: string,
  clubSlug: string
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("cancel_tournament", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/admin/tournaments/${tournamentId}`);
  return { success: true, tournament: data?.[0] };
}

// ─── startTournament ───────────────────────────────────────────────────────────
// registration_closed → in_progress. El botón explícito "Iniciar torneo".

export async function startTournament(
  clubId: string,
  tournamentId: string,
  clubSlug: string
): Promise<TournamentActionState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("start_tournament", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/admin/tournaments/${tournamentId}`);
  return { success: true, tournament: data?.[0] };
}

// ─── finalizeTournament ─────────────────────────────────────────────────────────
// in_progress → completed. Congela la clasificación y aplica los puntos al
// ranking de cada integrante final, en partes iguales. Idempotente.

export async function finalizeTournament(
  clubId: string,
  tournamentId: string,
  clubSlug: string
): Promise<TournamentFinalizeState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase.rpc("finalize_tournament", {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: tournamentErrorMessage(error) };

  revalidatePath(`/${clubSlug}/admin/tournaments`);
  revalidatePath(`/${clubSlug}/admin/tournaments/${tournamentId}`);
  return { success: true, alreadyFinalized: data?.[0]?.already_finalized ?? false };
}
