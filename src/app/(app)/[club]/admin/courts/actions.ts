"use server";

import { createClient } from "@/lib/supabase/server";

export type CourtFormState = {
  success?: boolean;
  error?: string;
};

// ─── Shared permission guard ─────────────────────────────────────────────────

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase: null, user: null, error: "No autenticado." };
  }

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return { supabase: null, user: null, error: "Sin permiso." };
  }

  return { supabase, user, error: null };
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
