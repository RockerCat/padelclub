"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface LogoUploadProps {
  clubId: string;
  clubName: string;
  currentLogoUrl: string | null;
  primaryColor: string;
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LogoUpload({
  clubId,
  clubName,
  currentLogoUrl,
  primaryColor,
}: LogoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const [storedUrl, setStoredUrl] = useState<string | null>(currentLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no válido. Usa PNG, JPG o WEBP.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("El archivo supera el límite de 2 MB.");
      return;
    }

    // Immediate local preview before upload completes
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      // Unique filename avoids browser caching issues on logo replacement
      const path = `${clubId}/logo_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("club-logos")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError("Error al subir la imagen. Intenta de nuevo.");
        setPreviewUrl(storedUrl);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("club-logos").getPublicUrl(path);

      setStoredUrl(publicUrl);
      setPreviewUrl(publicUrl);
    } finally {
      setUploading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleRemove() {
    setPreviewUrl(null);
    setStoredUrl(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-white/80">Logo del club</span>

      {/* Carries the uploaded URL into the form action */}
      <input type="hidden" name="logo_url" value={storedUrl ?? ""} />

      <div className="flex items-center gap-4">
        {/* Preview */}
        <div
          className={cn(
            "w-16 h-16 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden",
            !previewUrl && "border border-white/10"
          )}
          style={
            !previewUrl
              ? {
                  backgroundColor: `${primaryColor}22`,
                  color: primaryColor,
                }
              : undefined
          }
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Logo de ${clubName}`}
              className="w-full h-full object-cover"
            />
          ) : (
            getInitials(clubName)
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-xl border border-white/20 text-white hover:border-white/40 hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Subiendo…" : previewUrl ? "Cambiar logo" : "Subir logo"}
            </button>

            {storedUrl && !uploading && (
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <X className="w-4 h-4" />
                Quitar
              </button>
            )}
          </div>

          <p className="text-xs text-brand-muted">PNG, JPG o WEBP · Máx. 2 MB</p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
