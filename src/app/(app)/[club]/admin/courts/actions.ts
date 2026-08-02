"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";

export type CourtFormState = {
  success?: boolean;
  error?: string;
};

// ─── Shared permission guard ─────────────────────────────────────────────────
// Real OWNER/ADMIN membership behaves exactly as before; resolveClubAccess
// additionally recognizes SUPERADMIN's elevated "Entrar al club" access
// (never a club_members row) for an active club — see src/lib/clubAccess.ts.

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);

  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { supabase: null, user: null, error: access.authorized ? "Sin permiso." : access.error };
  }

  return { supabase, user: access.user, error: null };
}

// ─── Shared field parsing ────────────────────────────────────────────────────

function parseStreamingUrl(formData: FormData): { value: string | null; error?: string } {
  const raw = (formData.get("streaming_url") as string | null)?.trim() || "";
  if (!raw) return { value: null };

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { value: null, error: "El link de streaming debe ser una URL http(s) válida." };
    }
  } catch {
    return { value: null, error: "El link de streaming debe ser una URL válida." };
  }

  return { value: raw };
}

// ─── createCourt ─────────────────────────────────────────────────────────────

export async function createCourt(
  clubId: string,
  _prevState: CourtFormState,
  formData: FormData
): Promise<CourtFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const surface = (formData.get("surface") as string | null)?.trim() || null;
  const is_indoor_raw = formData.get("is_indoor") as string | null;
  const is_indoor = is_indoor_raw === "true" ? true : is_indoor_raw === "false" ? false : null;
  const sort_order = parseInt((formData.get("sort_order") as string | null) ?? "0", 10) || 0;

  if (!name || name.length < 2) {
    return { error: "El nombre debe tener al menos 2 caracteres." };
  }

  const streaming = parseStreamingUrl(formData);
  if (streaming.error) return { error: streaming.error };

  const { error } = await supabase.from("courts").insert({
    club_id: clubId,
    name,
    description,
    surface,
    is_indoor,
    sort_order,
    streaming_url: streaming.value,
  });

  if (error) {
    return { error: "Error al crear la cancha. Intenta de nuevo." };
  }

  return { success: true };
}

// ─── updateCourt ─────────────────────────────────────────────────────────────

export async function updateCourt(
  clubId: string,
  courtId: string,
  _prevState: CourtFormState,
  formData: FormData
): Promise<CourtFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const surface = (formData.get("surface") as string | null)?.trim() || null;
  const is_indoor_raw = formData.get("is_indoor") as string | null;
  const is_indoor = is_indoor_raw === "true" ? true : is_indoor_raw === "false" ? false : null;
  const sort_order = parseInt((formData.get("sort_order") as string | null) ?? "0", 10) || 0;

  if (!name || name.length < 2) {
    return { error: "El nombre debe tener al menos 2 caracteres." };
  }

  const streaming = parseStreamingUrl(formData);
  if (streaming.error) return { error: streaming.error };

  const { error } = await supabase
    .from("courts")
    .update({ name, description, surface, is_indoor, sort_order, streaming_url: streaming.value })
    .eq("id", courtId)
    .eq("club_id", clubId);

  if (error) {
    return { error: "Error al guardar los cambios. Intenta de nuevo." };
  }

  return { success: true };
}

// ─── toggleCourtActive ───────────────────────────────────────────────────────

export async function toggleCourtActive(
  clubId: string,
  courtId: string,
  isActive: boolean
): Promise<CourtFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from("courts")
    .update({ is_active: isActive })
    .eq("id", courtId)
    .eq("club_id", clubId);

  if (error) {
    return { error: "Error al cambiar el estado de la cancha." };
  }

  return { success: true };
}

// ─── deleteCourt ─────────────────────────────────────────────────────────────

// Permanent deletion — only ever succeeds for a court that has NEVER had a
// reservation (any status, any date, past or future; match/class/block
// alike, since those are all just reservations.type values). Everything
// else (has history at all) must be deactivated instead — the existing
// toggleCourtActive flow, which preserves history. The real check is
// backend-only, inside the delete_court RPC (SECURITY DEFINER, re-derives
// role from auth.uid() itself and re-validates the court belongs to
// clubId) — requireAdminRole here is only a fast, friendly early return for
// the common "not a member" case, never the source of truth.
export async function deleteCourt(clubId: string, courtId: string): Promise<CourtFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.rpc("delete_court", { p_court_id: courtId });

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "No puedes eliminar esta cancha porque tiene actividad registrada. Puedes desactivarla para impedir nuevas reservas sin perder el historial.",
      };
    }
    if (error.code === "42501") {
      return { error: "No tienes permiso para eliminar esta cancha." };
    }
    if (error.code === "P0002") {
      return { error: "Esta cancha ya no existe." };
    }
    return { error: "Error al eliminar la cancha. Intenta de nuevo." };
  }

  return { success: true };
}
