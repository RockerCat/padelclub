"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { Button, ConfirmDialog, Toast } from "@/components/ui";
import { updateProfileAvatar } from "./actions";

interface ProfileAvatarUploadProps {
  name: string;
  avatarUrl: string | null;
}

// Mismo catálogo/límite que club-assets (20260615000007) — nunca SVG/GIF.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "profile-avatars";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Solo reconoce (y por lo tanto solo borra) un objeto que viva en NUESTRO
// bucket, dentro de la carpeta del usuario actual — una URL externa o un
// avatar_url de origen desconocido nunca se toca.
function extractOwnedStoragePath(url: string, userId: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length);
  return path.startsWith(`${userId}/`) ? path : null;
}

// Único punto de edición de la foto de perfil — vive en Mi Perfil, no una
// pantalla aparte. Reutiliza PlayerAvatar tal cual (misma forma circular,
// mismo fallback de iniciales, mismo object-cover) para que la vista previa
// sea idéntica a como se ve en el resto de la app.
export function ProfileAvatarUpload({ name, avatarUrl }: ProfileAvatarUploadProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentUrl, setCurrentUrl] = useState(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no válido. Usa JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es 5 MB.`);
      return;
    }

    setUploading(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("No autenticado.");
        return;
      }

      const ext = MIME_TO_EXT[file.type] ?? "jpg";
      // Carpeta propia (auth.uid(), exigida por profile_avatars_insert) +
      // nombre versionado — nunca sobrescribe el archivo anterior y evita
      // que el navegador siga mostrando la foto vieja desde caché.
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
      });
      if (uploadError) {
        console.error("[ProfileAvatarUpload] upload failed:", uploadError);
        setError("No se pudo subir la imagen. Intenta de nuevo.");
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // Orden seguro: subir primero, recién después apuntar profiles.
      // avatar_url a lo nuevo. Si esto falla, la imagen anterior nunca se
      // tocó — solo se limpia el archivo recién subido (huérfano) y se
      // muestra el error.
      const result = await updateProfileAvatar(publicUrl);
      if (result.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        setError(result.error);
        return;
      }

      // Recién ahora que profiles.avatar_url ya apunta al archivo nuevo es
      // seguro borrar el anterior — y solo si es nuestro (mismo bucket,
      // misma carpeta de este usuario).
      if (currentUrl) {
        const oldPath = extractOwnedStoragePath(currentUrl, user.id);
        if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
      }

      setCurrentUrl(publicUrl);
      setToastMessage("Foto de perfil actualizada");
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setError(null);
    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("No autenticado.");
        return;
      }

      // profiles.avatar_url a null PRIMERO — así el perfil nunca queda
      // apuntando a un archivo que está a punto de borrarse, incluso si el
      // borrado en Storage fallara después.
      const result = await updateProfileAvatar(null);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (currentUrl) {
        const oldPath = extractOwnedStoragePath(currentUrl, user.id);
        if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
      }

      setCurrentUrl(null);
      setToastMessage("Foto de perfil eliminada");
      router.refresh();
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="group relative shrink-0 rounded-full disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        aria-label={currentUrl ? "Cambiar foto de perfil" : "Subir foto de perfil"}
      >
        <PlayerAvatar player={{ full_name: name, avatar_url: currentUrl }} size="2xl" />
        <span className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <Camera className="w-6 h-6 text-white" aria-hidden="true" />
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "Subiendo…" : currentUrl ? "Cambiar foto" : "Subir foto"}
        </Button>
        {currentUrl && !uploading && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
            Eliminar foto
          </Button>
        )}
      </div>

      <p className="text-[11px] text-brand-muted/60">JPG, PNG o WEBP · Máx. 5 MB</p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Eliminar foto de perfil"
        message="¿Seguro que quieres eliminar tu foto de perfil? Volverás a mostrar tus iniciales."
        confirmLabel="Eliminar foto"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
