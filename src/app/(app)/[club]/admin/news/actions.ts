"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";

export type NewsFormState = {
  success?: boolean;
  error?: string;
};

// ─── Shared permission guard ─────────────────────────────────────────────────

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);

  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { supabase: null, user: null, error: access.authorized ? "Sin permiso." : access.error };
  }

  return { supabase, user: access.user, error: null };
}

// ─── Shared error translation (create_club_news) ─────────────────────────────
// Todo mensaje real viene del propio RPC (20261001000002) — nunca
// inventado aquí. El mismo trío de reglas de tournament_id (pertenece al
// club, completed, una sola noticia por torneo) vive ahora en el RPC, con
// mensajes de negocio propios en vez de depender del error crudo del
// índice único.
function newsErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Sin permiso.";
  if (error.code === "P0002") return "El torneo no existe o no pertenece a este club.";
  if (error.code === "P0005") return "Este club se encuentra archivado.";

  if (error.code === "22023") {
    const msg = error.message ?? "";
    if (msg.includes("Title must be at least 3 characters")) return "El título debe tener al menos 3 caracteres.";
    if (msg.includes("Content is required")) return "El contenido es obligatorio.";
    if (msg.includes("Image is required")) return "La imagen es obligatoria.";
    if (msg.includes("Tournament must be completed")) {
      return "El torneo debe estar finalizado para generar su noticia.";
    }
    if (msg.includes("already has a published news item")) {
      return 'Este torneo ya tiene una noticia publicada. Actualiza la página para ver "Ver noticia".';
    }
  }

  console.error("[news] create_club_news RPC failed:", error);
  return "Error al publicar la noticia. Intenta de nuevo.";
}

// ─── createNews ──────────────────────────────────────────────────────────────
// tournamentId: bound server-action argument (never un campo de formulario
// editable) — el único lugar de este archivo con conocimiento del cierre
// editorial de un torneo. `null` para una noticia normal (el flujo de
// siempre, sin ningún cambio de comportamiento). El RPC create_club_news
// hace toda la validación real (título/contenido/imagen, permiso,
// tournament_id) y genera el slug de forma segura ante concurrencia —
// nunca "SELECT para ver si está libre" seguido de un INSERT separado,
// que sí tendría una carrera real entre dos pestañas o solicitudes
// simultáneas.
export async function createNews(
  clubId: string,
  tournamentId: string | null,
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

  // SQL acepta NULL para p_tournament_id; los tipos generados no lo reflejan.
  const { error } = await supabase.rpc("create_club_news", {
    p_club_id: clubId,
    p_title: title,
    p_content: content,
    p_image_url: image_url,
    p_tournament_id: tournamentId as string,
  });

  if (error) return { error: newsErrorMessage(error) };

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
