import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { normalizePhone, isValidPhone } from "./phone";

// Portado de src/app/(app)/profile/actions.ts (app web) — mismas dos
// mutaciones de la propia fila (`profiles.avatar_url`/`profiles.phone`),
// misma normalizePhone/isValidPhone (shared/utils/phone.ts, nunca una
// segunda regla), mismos mensajes de error. `.eq("id", userId)` explícito
// por la misma razón que WEB: redundante con profiles_update_own (RLS) pero
// nunca confiar en una sola capa.

export type UpdatePhoneResult = { success: true; phone: string } | { success: false; error: string };

export async function updateOwnPhone(
  supabase: SupabaseClient<Database>,
  userId: string,
  rawPhone: string
): Promise<UpdatePhoneResult> {
  const trimmed = rawPhone.trim();
  if (!trimmed) return { success: false, error: "Ingresa tu número de WhatsApp." };
  if (!isValidPhone(trimmed)) {
    return {
      success: false,
      error: normalizePhone(trimmed).length < 10 ? "Incluye el código de país." : "El número de WhatsApp no es válido.",
    };
  }

  const phone = normalizePhone(trimmed);
  const { error } = await supabase.from("profiles").update({ phone }).eq("id", userId);
  if (error) return { success: false, error: "No se pudo guardar el número. Intenta de nuevo." };

  return { success: true, phone };
}

export type UpdateAvatarResult = { success: true } | { success: false; error: string };

export async function updateProfileAvatar(
  supabase: SupabaseClient<Database>,
  userId: string,
  avatarUrl: string | null
): Promise<UpdateAvatarResult> {
  const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) return { success: false, error: "No se pudo guardar la foto de perfil. Intenta de nuevo." };
  return { success: true };
}
