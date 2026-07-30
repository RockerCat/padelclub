"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "club-assets";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface TournamentImageUploadProps {
  clubId: string;
  currentImageUrl?: string | null;
}

// Same bucket/RLS/path convention already used by NewsImageUpload and
// CoverUploadField (clubs/{clubId}/...) — no new upload system, no new
// bucket, no new policy. Uploads straight to club-assets, then carries the
// resulting public URL into the surrounding <form> via a hidden input
// named cover_image_url — the form's own submit (create/update) persists
// it, same separation as those two precedents. Adds drag & drop and an
// explicit remove-before-save affordance on top of that shared pattern,
// per the Bloque 2 UX requirement.
export function TournamentImageUpload({ clubId, currentImageUrl }: TournamentImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl ?? null);
  const [storedUrl, setStoredUrl] = useState<string | null>(currentImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no válido. Usa PNG, JPG o WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.`);
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      const supabase = createClient();
      const ext = MIME_TO_EXT[file.type] ?? "jpg";
      const path = `clubs/${clubId}/tournaments/cover-${Date.now()}.${ext}`;

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

  function handleRemove() {
    setPreviewUrl(null);
    setStoredUrl(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-white/80">Imagen promocional (opcional)</label>

      <input type="hidden" name="cover_image_url" value={storedUrl ?? ""} />

      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && fileRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !uploading) fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (uploading) return;
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`relative w-full aspect-video rounded-xl border border-dashed overflow-hidden flex items-center justify-center transition-colors cursor-pointer ${
          dragOver ? "border-brand-primary bg-brand-primary/5" : "border-white/15 bg-white/[0.02] hover:border-white/30"
        } ${uploading ? "cursor-wait" : ""}`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-brand-muted/60 pointer-events-none px-4 text-center">
            <ImageIcon className="w-6 h-6" />
            <span className="text-xs">Arrastra una imagen o haz clic para seleccionarla</span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-black/60 px-3 py-1.5 rounded-lg">
              <Upload className="w-3.5 h-3.5" />
              {previewUrl ? "Cambiar imagen" : "Subir imagen"}
            </span>
          )}
        </div>
      </div>

      {previewUrl && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex items-center gap-1.5 self-start h-8 px-3 text-xs rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Quitar imagen
        </button>
      )}

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
