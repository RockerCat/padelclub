"use client";

import { useState, useRef } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateClubCover } from "@/app/(app)/[club]/admin/settings/actions";

interface CoverUploadFieldProps {
  clubId: string;
  currentCoverUrl: string | null;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

export function CoverUploadField({ clubId, currentCoverUrl }: CoverUploadFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentCoverUrl);
  const [uploading, setUploading] = useState(false);
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
      const ext  = MIME_TO_EXT[file.type] ?? "jpg";
      const path = `clubs/${clubId}/cover-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("club-assets")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError(`Error al subir: ${uploadError.message}`);
        setPreviewUrl(currentCoverUrl);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("club-assets")
        .getPublicUrl(path);

      const { error: saveError } = await updateClubCover(clubId, publicUrl);
      if (saveError) {
        setError(saveError);
        return;
      }

      setPreviewUrl(publicUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/80">Portada del club</span>
        <span
          className="text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: "color-mix(in srgb, var(--club-primary, #00ffff) 12%, transparent)",
            color: "var(--club-primary, #00ffff)",
          }}
        >
          Recomendado
        </span>
      </div>

      {/* Preview rectangle */}
      <div
        className="w-full h-28 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden relative flex items-center justify-center"
        style={
          previewUrl
            ? { backgroundImage: `url(${previewUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {!previewUrl && (
          <div className="flex flex-col items-center gap-1.5 text-brand-muted/30">
            <ImageIcon className="w-7 h-7" />
            <span className="text-[11px]">Sin portada</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-xl border border-white/20 text-white hover:border-white/40 hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Subiendo…" : previewUrl ? "Cambiar portada" : "Subir portada"}
        </button>

        {previewUrl && !uploading && (
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Quitar
          </button>
        )}
      </div>

      <p className="text-xs text-brand-muted/60">
        PNG, JPG o WEBP · Máx. 5 MB · Recomendado 1920×400 px
      </p>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
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
    </div>
  );
}
