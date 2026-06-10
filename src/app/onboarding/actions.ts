"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export type CreateClubState = {
  error?: string;
  fieldErrors?: {
    name?: string;
    slug?: string;
  };
};

export async function createClub(
  _prevState: CreateClubState,
  formData: FormData
): Promise<CreateClubState> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slug = (formData.get("slug") as string | null)?.trim() ?? "";

  // Validation
  const fieldErrors: CreateClubState["fieldErrors"] = {};

  if (!name || name.length < 2) {
    fieldErrors.name = "El nombre debe tener al menos 2 caracteres.";
  }

  if (!slug) {
    fieldErrors.slug = "El identificador es obligatorio.";
  } else if (slug.length < 3) {
    fieldErrors.slug = "El identificador debe tener al menos 3 caracteres.";
  } else if (!SLUG_REGEX.test(slug)) {
    fieldErrors.slug =
      "Solo letras minúsculas, números y guiones. Debe empezar y terminar con letra o número.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  // Insert club
  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .insert({ name, slug })
    .select("id, slug")
    .single();

  if (clubError) {
    // Unique constraint violation on slug
    if (clubError.code === "23505") {
      return {
        fieldErrors: {
          slug: "Este identificador ya está en uso. Elige otro.",
        },
      };
    }
    return { error: "Error al crear el club. Por favor, intenta de nuevo." };
  }

  // Insert club_members row (OWNER)
  const { error: memberError } = await supabase.from("club_members").insert({
    club_id: club.id,
    profile_id: user.id,
    role: "OWNER",
    is_active: true,
  });

  if (memberError) {
    return { error: "Error al configurar el club. Por favor, intenta de nuevo." };
  }

  redirect(`/${club.slug}/admin/settings`);
}
