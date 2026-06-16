"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  updateClubLogo,
  updateClubCover,
} from "@/app/(app)/[club]/admin/settings/actions";

// ─── Shared constants ──────────────────────────────────────────────────────────

const BUCKET = "club-assets";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function validate(file: File, maxBytes: number): string | null {
  if (!ALLOWED_TYPES.includes(file.type))
    return "Formato no válido. Usa PNG, JPG o WEBP.";
  if (file.size > maxBytes)
    return `Archivo demasiado grande. Máximo ${maxBytes / 1024 / 1024} MB.`;
  return null;
}

// ─── Cover Upload Button ────────────────────────────────────────────────────────
// Renders inside the cover <div> (which has `position: relative`).

export function CoverUploadButton({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    const validationError = validate(file, 5 * 1024 * 1024);
    if (validationError) { setError(validationError); return; }

    // Immediate local preview while upload runs
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      const supabase = createClient();
      const ext  = MIME_TO_EXT[file.type] ?? "jpg";
      const path = `clubs/${clubId}/cover-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError(`Error al subir: ${uploadError.message}`);
        setPreviewUrl(null);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: saveError } = await updateClubCover(clubId, publicUrl);
      if (saveError) setError(saveError);

      // Server components re-render with the new cover_image_url
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {/* Local preview overlay while the server catches up */}
      {previewUrl && (
        <div
          className="absolute inset-0 z-[1] bg-cover bg-center"
          style={{ backgroundImage: `url(${previewUrl})` }}
        />
      )}

      {/* Upload trigger button */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/55 hover:bg-black/75 disabled:opacity-50 text-white text-xs font-medium backdrop-blur-sm transition-colors"
      >
        {uploading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Camera className="w-3.5 h-3.5" />}
        {uploading ? "Subiendo…" : "Cambiar portada"}
      </button>

      {/* Error banner */}
      {error && (
        <div className="absolute bottom-3 left-3 right-16 z-10 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-950/90 border border-red-500/20 text-red-300 text-xs backdrop-blur-sm">
          <span className="flex-1 leading-snug">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 mt-px text-red-400 hover:text-red-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
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
    </>
  );
}

// ─── Logo Upload Button ─────────────────────────────────────────────────────────
// Renders inside the logo wrapper (which has `position: relative`).
// Sits outside the inner `overflow-hidden` div so the badge peeks beyond the
// logo's rounded corners.

export function LogoUploadButton({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    const validationError = validate(file, 2 * 1024 * 1024);
    if (validationError) { setError(validationError); return; }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext  = MIME_TO_EXT[file.type] ?? "jpg";
      const path = `clubs/${clubId}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: saveError } = await updateClubLogo(clubId, publicUrl);
      if (saveError) setError(saveError);

      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        title="Cambiar logo"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-black/80 border-2 border-[#0a0a0a] flex items-center justify-center hover:bg-black/95 disabled:opacity-50 transition-colors"
      >
        {uploading
          ? <Loader2 className="w-3 h-3 text-white animate-spin" />
          : <Camera className="w-3 h-3 text-white" />}
      </button>

      {/* Error tooltip — floats above the button */}
      {error && (
        <div className="absolute bottom-full right-0 mb-2 z-30 max-w-[180px] px-2.5 py-1.5 rounded-lg bg-red-950/95 border border-red-500/20 text-red-300 text-xs leading-snug">
          <button
            type="button"
            onClick={() => setError(null)}
            className="float-right ml-1 text-red-400 hover:text-red-200"
          >
            <X className="w-3 h-3" />
          </button>
          {error}
        </div>
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
    </>
  );
}
