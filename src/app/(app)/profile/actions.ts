"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { normalizePhone, isValidPhone } from "@/lib/utils/phone";

export type UpdateAvatarState = { success?: boolean; error?: string };

// The only server-side responsibility of this module: persist
// profiles.avatar_url for the CALLER's own row. Everything else (choosing
// the file, validating it, uploading/removing the object in Supabase
// Storage) happens client-side in ProfileAvatarUpload, against the
// profile-avatars bucket's own RLS policies (20260827000001) — there is no
// service_role anywhere in this flow.
//
// `.eq("id", user.id)` is redundant with profiles_update_own
// (`USING (id = auth.uid())`, 20260610000001) and the column-level
// GRANT UPDATE (avatar_url, ...) already in place (20260809000001) — kept
// explicit anyway, same "never trust a single layer" posture already used
// elsewhere in this codebase, even though a caller could never reach
// another profile's row here regardless.
export async function updateProfileAvatar(avatarUrl: string | null): Promise<UpdateAvatarState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);

  if (error) {
    console.error("[updateProfileAvatar] Failed to update profiles.avatar_url:", {
      userId: user.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { error: "No se pudo guardar la foto de perfil. Intenta de nuevo." };
  }

  revalidatePath("/profile");
  return { success: true };
}

export type UpdatePhoneState = { success?: boolean; error?: string; phone?: string };

// Única mutación de profiles.phone del proyecto — reutilizada tanto por Mi
// Perfil (edición directa) como por el modal "completa tu WhatsApp" del
// flujo de unión a un club (src/app/clubs/[slug]/RequestAccessButton.tsx),
// para no crear una segunda fuente de verdad. Mismas normalizePhone/
// isValidPhone que ya usa SignupForm — nunca una segunda regla de
// validación. Mismo patrón de seguridad que updateProfileAvatar arriba:
// `.eq("id", user.id)` explícito, aunque profiles_update_own + el GRANT
// UPDATE (phone, ...) de 20260809000001 ya lo garantizan por sí solos — un
// usuario nunca puede alcanzar la fila de otro.
export async function updateOwnPhone(rawPhone: string): Promise<UpdatePhoneState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const trimmed = rawPhone.trim();
  if (!trimmed) return { error: "Ingresa tu número de WhatsApp." };
  if (!isValidPhone(trimmed)) {
    return {
      error: normalizePhone(trimmed).length < 10 ? "Incluye el código de país." : "El número de WhatsApp no es válido.",
    };
  }

  const phone = normalizePhone(trimmed);
  const { error } = await supabase.from("profiles").update({ phone }).eq("id", user.id);

  if (error) {
    console.error("[updateOwnPhone] Failed to update profiles.phone:", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return { error: "No se pudo guardar el número. Intenta de nuevo." };
  }

  revalidatePath("/profile");
  return { success: true, phone };
}
