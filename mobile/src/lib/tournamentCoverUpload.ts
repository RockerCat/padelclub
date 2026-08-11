import * as ImagePicker from "expo-image-picker";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de TournamentImageUpload.tsx (app web) — mismo bucket
// (`club-assets`), misma convención de ruta
// (`clubs/{clubId}/tournaments/cover-{timestamp}.{ext}`), mismas
// restricciones exactas (PNG/JPG/WEBP, máximo 5MB) y mismos textos de
// error. La única diferencia real es el origen del archivo: web usa un
// <input type="file">/drag&drop del navegador, mobile usa el selector de
// imágenes nativo (expo-image-picker, ya presente en Expo Go — no
// requiere un dev client custom).
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function extensionFromUri(uri: string): string {
  const match = uri.match(/\.(\w+)$/);
  const ext = match?.[1]?.toLowerCase();
  if (ext === "png" || ext === "webp" || ext === "jpg" || ext === "jpeg") return ext === "jpeg" ? "jpg" : ext;
  return "jpg";
}

export async function pickAndUploadTournamentCover(
  supabase: SupabaseClient<Database>,
  clubId: string
): Promise<{ url: string | null; error: string | null; cancelled: boolean }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { url: null, error: "Necesitamos acceso a tus fotos para elegir una portada.", cancelled: false };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]) return { url: null, error: null, cancelled: true };

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? "image/jpeg";
  if (!ALLOWED_MIME.includes(mimeType)) {
    return { url: null, error: "Formato no válido. Usa PNG, JPG o WEBP.", cancelled: false };
  }
  if (asset.fileSize && asset.fileSize > MAX_BYTES) {
    const mb = (asset.fileSize / (1024 * 1024)).toFixed(1);
    return { url: null, error: `El archivo pesa ${mb} MB. Máximo 5 MB.`, cancelled: false };
  }

  const ext = ALLOWED_MIME.includes(mimeType) ? extensionFromMime(mimeType) : extensionFromUri(asset.uri);
  const path = `clubs/${clubId}/tournaments/cover-${Date.now()}.${ext}`;

  const arraybuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
  if (arraybuffer.byteLength > MAX_BYTES) {
    const mb = (arraybuffer.byteLength / (1024 * 1024)).toFixed(1);
    return { url: null, error: `El archivo pesa ${mb} MB. Máximo 5 MB.`, cancelled: false };
  }

  const { error: uploadError } = await supabase.storage.from("club-assets").upload(path, arraybuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) return { url: null, error: "No fue posible subir la imagen. Inténtalo de nuevo.", cancelled: false };

  const { data: publicUrlData } = supabase.storage.from("club-assets").getPublicUrl(path);
  return { url: publicUrlData.publicUrl, error: null, cancelled: false };
}
