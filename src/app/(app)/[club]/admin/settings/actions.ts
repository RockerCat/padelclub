"use server";

import { createClient } from "@/lib/supabase/server";
import { timeToMinutes, type OperatingHour } from "@/lib/operatingHours";
import { DURATION_CATALOG } from "@/lib/durations";

export type UpdateAllowedDurationsState = { success?: boolean; error?: string };

export type UpdateClubState = {
  success?: boolean;
  error?: string;
};

/**
 * Called immediately after a logo is uploaded to Storage.
 * Persists the public URL to clubs.logo_url so the sidebar reflects the
 * new logo on the next router.refresh() without waiting for the main form save.
 */
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

export async function updateClub(
  clubId: string,
  _prevState: UpdateClubState,
  formData: FormData
): Promise<UpdateClubState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "No autenticado. Por favor, inicia sesión de nuevo." };
  }

  // Verify the user is OWNER of this club
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

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const cover_image_url = (formData.get("cover_image_url") as string | null)?.trim() || null;
  const rawVisibility = formData.get("visibility") as string | null;
  const visibility = rawVisibility === "private" ? "private" : "public";
  const city = (formData.get("city") as string | null)?.trim() || null;
  const state = (formData.get("state") as string | null)?.trim() || null;
  const country = (formData.get("country") as string | null)?.trim() || null;
  const address = (formData.get("address") as string | null)?.trim() || null;
  const whatsapp = (formData.get("whatsapp") as string | null)?.trim() || null;
  const facebook = (formData.get("facebook") as string | null)?.trim() || null;
  const instagram = (formData.get("instagram") as string | null)?.trim() || null;
  const youtube = (formData.get("youtube") as string | null)?.trim() || null;
  const primary_color = (formData.get("primary_color") as string | null)?.trim() || "#B7E000";
  const secondary_color = (formData.get("secondary_color") as string | null)?.trim() || "#1698BE";
  const logo_url = (formData.get("logo_url") as string | null)?.trim() || null;

  if (!name || name.length < 2) {
    return { error: "El nombre del club debe tener al menos 2 caracteres." };
  }

  const { error: updateError } = await supabase
    .from("clubs")
    .update({
      name,
      description,
      cover_image_url,
      visibility,
      city,
      state,
      country,
      address,
      whatsapp,
      facebook,
      instagram,
      youtube,
      primary_color,
      secondary_color,
      logo_url,
    })
    .eq("id", clubId);

  if (updateError) {
    return { error: "Error al guardar los cambios. Por favor, intenta de nuevo." };
  }

  return { success: true };
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

  // Validate each day
  for (const h of hours) {
    if (h.is_open) {
      if (!h.opens_at || !h.closes_at) {
        return { error: "Ingresa hora de apertura y cierre para los días abiertos." };
      }
      if (timeToMinutes(h.opens_at) >= timeToMinutes(h.closes_at)) {
        return { error: "La hora de apertura debe ser anterior a la de cierre." };
      }
    }
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
    console.error("[saveOperatingHours] upsert failed:", upsertError);
    return { error: "Error al guardar los horarios. Intenta de nuevo." };
  }

  return { success: true };
}
