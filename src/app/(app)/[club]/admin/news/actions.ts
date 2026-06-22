"use server";

import { createClient } from "@/lib/supabase/server";

export type NewsFormState = {
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

// ─── createNews ──────────────────────────────────────────────────────────────

export async function createNews(
  clubId: string,
  _prevState: NewsFormState,
  formData: FormData
): Promise<NewsFormState> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError! };

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const content = (formData.get("content") as string | null)?.trim() ?? "";
  const image_url = (formData.get("image_url") as string | null)?.trim() ?? "";

  if (!title || title.length < 3) {
    return { error: "El título debe tener al menos 3 caracteres." };
  }
  if (!content) {
    return { error: "El contenido es obligatorio." };
  }
  if (!image_url) {
    return { error: "La imagen es obligatoria." };
  }

  const { error } = await supabase.from("club_news").insert({
    club_id: clubId,
    title,
    content,
    image_url,
    created_by: user.id,
  });

  if (error) {
    return { error: "Error al publicar la noticia. Intenta de nuevo." };
  }

  return { success: true };
}

// ─── updateNews ──────────────────────────────────────────────────────────────

export async function updateNews(
  clubId: string,
  newsId: string,
  _prevState: NewsFormState,
  formData: FormData
): Promise<NewsFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const content = (formData.get("content") as string | null)?.trim() ?? "";
  const image_url = (formData.get("image_url") as string | null)?.trim() ?? "";

  if (!title || title.length < 3) {
    return { error: "El título debe tener al menos 3 caracteres." };
  }
  if (!content) {
    return { error: "El contenido es obligatorio." };
  }
  if (!image_url) {
    return { error: "La imagen es obligatoria." };
  }

  const { error } = await supabase
    .from("club_news")
    .update({ title, content, image_url })
    .eq("id", newsId)
    .eq("club_id", clubId);

  if (error) {
    return { error: "Error al guardar los cambios. Intenta de nuevo." };
  }

  return { success: true };
}

// ─── deleteNews ──────────────────────────────────────────────────────────────

export async function deleteNews(clubId: string, newsId: string): Promise<NewsFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from("club_news")
    .delete()
    .eq("id", newsId)
    .eq("club_id", clubId);

  if (error) {
    return { error: "Error al eliminar la noticia." };
  }

  return { success: true };
}
