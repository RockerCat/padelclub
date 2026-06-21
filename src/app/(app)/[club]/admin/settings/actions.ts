"use server";

import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES, validateOperatingHours, type OperatingHour } from "@/lib/operatingHours";
import { DURATION_CATALOG } from "@/lib/durations";

export type UpdateAllowedDurationsState = { success?: boolean; error?: string };

/**
 * Called immediately after a cover image is uploaded to Storage (see
 * CoverUploadField) — persists the public URL to clubs.cover_image_url
 * right away, since the Branding modal has no separate "save" step for it.
 */
export async function updateClubCover(
  clubId: string,
  coverUrl: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "OWNER") {
    return { error: "No tienes permiso para editar este club." };
  }

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ cover_image_url: coverUrl || null })
    .eq("id", clubId);

  if (updateError) return { error: updateError.message };
  return {};
}

export async function updateClubLogo(
  clubId: string,
  logoUrl: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "No autenticado." };
  }

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "OWNER") {
    return { error: "No tienes permiso para editar este club." };
  }

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ logo_url: logoUrl || null })
    .eq("id", clubId);

  if (updateError) {
    return { error: updateError.message };
  }

  return {};
}

export async function updateClubName(
  clubId: string,
  name: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "OWNER")
    return { error: "No tienes permiso para editar este club." };

  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2)
    return { error: "El nombre debe tener al menos 2 caracteres." };

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ name: trimmed })
    .eq("id", clubId);

  if (updateError) return { error: "Error al guardar. Intenta de nuevo." };
  return {};
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function updateClubColors(
  clubId: string,
  primaryColor: string,
  secondaryColor: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "OWNER")
    return { error: "No tienes permiso para editar este club." };

  if (!HEX_COLOR_RE.test(primaryColor) || !HEX_COLOR_RE.test(secondaryColor))
    return { error: "Los colores deben ser un valor hexadecimal válido." };

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ primary_color: primaryColor, secondary_color: secondaryColor })
    .eq("id", clubId);

  if (updateError) return { error: "Error al guardar. Intenta de nuevo." };
  return {};
}

const VALID_DURATION_MINUTES = DURATION_CATALOG.map((d) => d.minutes) as number[];

export async function updateAllowedDurations(
  clubId: string,
  _prevState: UpdateAllowedDurationsState,
  formData: FormData
): Promise<UpdateAllowedDurationsState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "OWNER") {
    return { error: "Solo el propietario puede modificar la configuración." };
  }

  const raw = formData.getAll("durations").map((v) => parseInt(v as string, 10));
  const durations = raw.filter((d) => VALID_DURATION_MINUTES.includes(d));

  if (durations.length === 0) {
    return { error: "Selecciona al menos una duración." };
  }

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ allowed_reservation_durations: durations.sort((a, b) => a - b) })
    .eq("id", clubId);

  if (updateError) {
    console.error("[updateAllowedDurations]", updateError);
    return { error: "Error al guardar. Intenta de nuevo." };
  }

  return { success: true };
}

export async function saveOperatingHours(
  clubId: string,
  hours: OperatingHour[]
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "OWNER") {
    return { error: "Solo el propietario puede modificar los horarios." };
  }

  // Validate each day — closes_at must be strictly after opens_at when open
  const dayErrors = validateOperatingHours(hours);
  if (dayErrors.size > 0) {
    const [day, message] = [...dayErrors.entries()][0];
    return { error: `${DAY_NAMES[day]}: ${message}` };
  }

  const rows = hours.map((h) => ({
    club_id: clubId,
    day_of_week: h.day_of_week,
    is_open: h.is_open,
    opens_at: h.is_open ? (h.opens_at ?? null) : null,
    closes_at: h.is_open ? (h.closes_at ?? null) : null,
  }));

  const { error: upsertError } = await supabase
    .from("club_operating_hours")
    .upsert(rows, { onConflict: "club_id,day_of_week" });

  if (upsertError) {
    console.error("[saveOperatingHours] upsert failed:", {
      message: upsertError.message,
      code: upsertError.code,
      details: upsertError.details,
      hint: upsertError.hint,
    });
    return { error: "Error al guardar los horarios. Intenta de nuevo." };
  }

  return { success: true };
}
