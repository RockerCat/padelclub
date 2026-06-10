"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdateClubState = {
  success?: boolean;
  error?: string;
};

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
