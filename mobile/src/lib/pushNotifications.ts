import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Fase 1 de Push Notifications — SOLO registro de dispositivo, ver
// supabase/migrations/20261109000001_push_tokens.sql. Nunca envía nada:
// esto únicamente llena public.push_tokens para que un sender futuro
// (Fase 2, Edge Function) tenga a quién escribirle. Nunca crea un
// notification propio ni toca public.notifications — push es otro canal
// de ENTREGA de esas mismas notifications, no un sistema paralelo (ver
// CLAUDE.md → Notifications & Live-Update Principles).
//
// Un solo punto de entrada, llamado una vez por sesión desde
// RootNavigator.tsx apenas hay `session` — nunca desde una pantalla
// individual, para que nunca haya dos intentos de registro compitiendo.
// Nunca lanza: cada paso que puede fallar (permiso denegado, sin
// projectId todavía, sin red, error de upsert) simplemente retorna sin
// tocar nada más — nunca debe poder bloquear login ni el resto de la app,
// exactamente como pide la Fase 1.
export async function registerPushToken(supabase: SupabaseClient<Database>, profileId: string): Promise<void> {
  try {
    // Simulador/emulador nunca recibe un push token real — evita un
    // getExpoPushTokenAsync que fallaría igual, y evita registrar un
    // token inútil que un sender futuro intentaría usar.
    if (!Device.isDevice) return;

    // Android 8+: el canal debe existir ANTES de pedir permiso/token — en
    // Android 13+ el propio prompt de permiso no aparece hasta que existe
    // al menos un canal (ver docs.expo.dev/versions/v54.0.0/sdk/notifications).
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    // El usuario rechazó (o ya había rechazado antes) — salida silenciosa,
    // nunca un error visible ni un bloqueo del resto del arranque.
    if (finalStatus !== "granted") return;

    // Requiere que el proyecto esté vinculado a EAS (extra.eas.projectId
    // en app.json, vía `eas init`/`eas build:configure`) — deliberadamente
    // NO configurado todavía en esta fase (ver CLAUDE.md: nada de EAS
    // Build/credenciales hasta la Fase 2). Sin esto, getExpoPushTokenAsync
    // no tiene forma de resolver el proyecto — se sale limpio en vez de
    // lanzar, dejando un rastro claro en consola para cuando se
    // configure.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn("[registerPushToken] Falta extra.eas.projectId — vincula el proyecto a EAS antes de la Fase 2 (envío real).");
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

    const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
    // Solo informativo (modelo/OS) — nunca la clave de deduplicación, ver
    // comentario en la migración. Nunca bloquea el registro si falta.
    const deviceId = Device.modelName ? `${Device.modelName} (${Device.osName ?? platform} ${Device.osVersion ?? ""})`.trim() : null;

    // onConflict: expo_push_token (no profile_id) — reasigna el mismo
    // dispositivo al perfil que se está autenticando ahora mismo en vez
    // de crear una segunda fila, cubriendo tanto "token nuevo" como
    // "token que ya existía pero cambió de dueño o quedó inactivo". Varios
    // dispositivos por profile_id siguen siendo filas independientes,
    // nunca chocan entre sí (cada una con su propio expo_push_token).
    const { error } = await supabase.from("push_tokens").upsert(
      {
        profile_id: profileId,
        expo_push_token: expoPushToken,
        platform,
        device_id: deviceId,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" }
    );

    if (error) console.error("[registerPushToken] upsert failed:", error);
  } catch (err) {
    console.error("[registerPushToken] unexpected error:", err);
  }
}
