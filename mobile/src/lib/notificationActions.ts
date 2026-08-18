import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de src/lib/notificationActions.ts (app web) — mismas dos
// mutaciones exactas (un `read_at = now()` sobre la propia fila del
// usuario, RLS/columna ya lo garantizan pero `.eq("profile_id", userId)`
// se mantiene explícito, misma postura que el resto del proyecto). Sin
// RPC nueva — la tabla `notifications` ya soporta esto tal cual.

export type NotificationActionResult = { error?: string };

export async function markNotificationRead(supabase: SupabaseClient<Database>, userId: string, id: string): Promise<NotificationActionResult> {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("profile_id", userId);
  if (error) return { error: "Error al marcar como leída." };
  return {};
}

export async function markAllNotificationsRead(supabase: SupabaseClient<Database>, userId: string): Promise<NotificationActionResult> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", userId)
    .is("read_at", null);
  if (error) return { error: "Error al marcar como leídas." };
  return {};
}
