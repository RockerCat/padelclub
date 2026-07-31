"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "club-assets";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface NewsImageUploadProps {
  clubId: string;
  currentImageUrl?: string | null;
}

// Uploads straight to the same club-assets bucket the gallery uses, then
// carries the resulting public URL into the surrounding form via a hidden
// input — the form's own submit (create/update) is what actually persists
// it, same separation as ClubHeroUploadButtons/GalleryModal.
export function NewsImageUpload({ clubId, currentImageUrl }: NewsImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl ?? null);
  const [storedUrl, setStoredUrl] = useState<string | null>(currentImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no válido. Usa PNG, JPG o WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Archivo demasiado grande. Máximo 5 MB.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      const supabase = createClient();
      const ext = MIME_TO_EXT[file.type] ?? "jpg";
      const path = `clubs/${clubId}/news-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError(`Error al subir: ${uploadError.message}`);
        setPreviewUrl(storedUrl);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setStoredUrl(publicUrl);
      setPreviewUrl(publicUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-white/80">Imagen</label>

      <input type="hidden" name="image_url" value={storedUrl ?? ""} />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="relative w-full aspect-[3/4] rounded-xl border border-dashed border-white/15 bg-white/[0.02] overflow-hidden flex items-center justify-center hover:border-white/30 transition-colors disabled:opacity-60"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-brand-muted/60">
            <ImageIcon className="w-6 h-6" />
            <span className="text-xs">Selecciona una imagen</span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-black/60 px-3 py-1.5 rounded-lg">
              <Upload className="w-3.5 h-3.5" />
              {previewUrl ? "Cambiar imagen" : "Subir imagen"}
            </span>
          )}
        </div>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      <p className="text-xs text-brand-muted">JPG, PNG o WEBP · Máximo 5 MB</p>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
