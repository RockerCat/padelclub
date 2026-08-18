import * as ImagePicker from "expo-image-picker";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de ProfileAvatarUpload.tsx (app web) — mismo bucket
// (`profile-avatars`), misma carpeta propia (`{userId}/`), mismo nombre
// versionado (`avatar-{timestamp}.{ext}`, nunca sobrescribe el archivo
// anterior), mismas restricciones (JPG/PNG/WEBP, máx. 5MB) y mismo orden
// seguro que tournamentCoverUpload.ts ya usa para su propio bucket: subir
// primero, recién después dejar que el llamador apunte profiles.avatar_url
// a lo nuevo, y solo entonces borrar el archivo anterior (ver ProfileScreen,
// que orquesta ese orden igual que ProfileAvatarUpload.tsx en WEB).
const BUCKET = "profile-avatars";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function pickAndUploadProfileAvatar(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ url: string | null; error: string | null; cancelled: boolean }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { url: null, error: "Necesitamos acceso a tus fotos para elegir una foto de perfil.", cancelled: false };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.[0]) return { url: null, error: null, cancelled: true };

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? "image/jpeg";
  if (!ALLOWED_MIME.includes(mimeType)) {
    return { url: null, error: "Formato no válido. Usa JPG, PNG o WEBP.", cancelled: false };
  }

  const arraybuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
  if (arraybuffer.byteLength > MAX_BYTES) {
    const mb = (arraybuffer.byteLength / (1024 * 1024)).toFixed(1);
    return { url: null, error: `El archivo pesa ${mb} MB. El máximo es 5 MB.`, cancelled: false };
  }

  const ext = extensionFromMime(mimeType);
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, arraybuffer, { contentType: mimeType });
  if (uploadError) return { url: null, error: "No se pudo subir la imagen. Intenta de nuevo.", cancelled: false };

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: publicUrlData.publicUrl, error: null, cancelled: false };
}

// Solo reconoce (y por lo tanto solo borra) un objeto que viva en nuestro
// bucket, dentro de la carpeta del usuario actual — idéntica guarda que
// extractOwnedStoragePath en ProfileAvatarUpload.tsx (app web).
function extractOwnedStoragePath(url: string, userId: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length);
  return path.startsWith(`${userId}/`) ? path : null;
}

export async function deleteOwnedAvatarObject(supabase: SupabaseClient<Database>, userId: string, url: string): Promise<void> {
  const path = extractOwnedStoragePath(url, userId);
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}
