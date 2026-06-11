"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { updateClubLogo } from "@/app/(app)/[club]/admin/settings/actions";

interface LogoUploadProps {
  clubId: string;
  clubName: string;
  currentLogoUrl: string | null;
  primaryColor: string;
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const [storedUrl, setStoredUrl] = useState<string | null>(currentLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    // ── Step 1: client-side validation ───────────────────────────────────────
    console.log("[LogoUpload] step=validate", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`Formato no válido: "${file.type}". Usa PNG, JPG o WEBP.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es 2 MB.`
      );
      return;
    }

    // ── Step 2: immediate local preview ──────────────────────────────────────
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      // ── Step 3: upload to Supabase Storage ─────────────────────────────────
      const supabase = createClient();
      const ext = MIME_TO_EXT[file.type] ?? "jpg";
      // Path: clubs/{clubId}/logo-{timestamp}.{ext}
      // RLS policy checks segment [2] (clubs / {clubId} / filename)
      const path = `clubs/${clubId}/logo-${Date.now()}.${ext}`;

      console.log("[LogoUpload] step=upload", { bucket: "club-logos", path });

      const { error: uploadError } = await supabase.storage
        .from("club-logos")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        console.error("[LogoUpload] step=upload FAILED", uploadError);
        setError(
          `Error al subir la imagen: ${uploadError.message}`
        );
        setPreviewUrl(storedUrl); // revert preview
        return;
      }

      console.log("[LogoUpload] step=upload OK");

      // ── Step 4: get public URL ──────────────────────────────────────────────
      const {
        data: { publicUrl },
      } = supabase.storage.from("club-logos").getPublicUrl(path);

      console.log("[LogoUpload] step=publicUrl", { publicUrl });

      // ── Step 5: persist logo_url to DB immediately ──────────────────────────
      console.log("[LogoUpload] step=save_to_db", { clubId, publicUrl });
      const { error: saveError } = await updateClubLogo(clubId, publicUrl);

      if (saveError) {
        console.error("[LogoUpload] step=save_to_db FAILED", saveError);
        // URL is already in storage — still update the preview and hidden input
        // so the user can save via the main form. Show a warning, not a hard error.
        setError(`Logo subido pero no se pudo guardar automáticamente: ${saveError}`);
      } else {
        console.log("[LogoUpload] step=save_to_db OK");
      }

      setStoredUrl(publicUrl);
      setPreviewUrl(publicUrl);

      // ── Step 6: refresh server components so sidebar shows new logo ─────────
      console.log("[LogoUpload] step=refresh_sidebar");
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleRemove() {
    console.log("[LogoUpload] step=remove");
    setPreviewUrl(null);
    setStoredUrl(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-white/80">Logo del club</span>

      {/* Carries the URL into the main form action */}
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
              ? { backgroundColor: `${primaryColor}22`, color: primaryColor }
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
