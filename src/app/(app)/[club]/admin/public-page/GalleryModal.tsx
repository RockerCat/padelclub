"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { SettingsModuleModal } from "../settings/SettingsModuleModal";
import { addGalleryImage, removeGalleryImage } from "../settings/actions";

const BUCKET = "club-assets";
const MAX_IMAGES = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

interface GalleryModalProps {
  clubId: string;
  images: string[];
  onClose: () => void;
}

export function GalleryModal({ clubId, images, onClose }: GalleryModalProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    if (images.length >= MAX_IMAGES) {
      setError(`Máximo ${MAX_IMAGES} fotos en la galería.`);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no válido. Usa PNG, JPG o WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Archivo demasiado grande. Máximo 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext  = MIME_TO_EXT[file.type] ?? "jpg";
      const path = `clubs/${clubId}/gallery-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError(`Error al subir: ${uploadError.message}`);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const result = await addGalleryImage(clubId, publicUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(url: string) {
    setError(null);
    setRemovingUrl(url);
    try {
      const path = storagePathFromPublicUrl(url);
      if (path) {
        const supabase = createClient();
        await supabase.storage.from(BUCKET).remove([path]);
      }
      const result = await removeGalleryImage(clubId, url);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setRemovingUrl(null);
    }
  }

  return (
    <SettingsModuleModal
      title="Galería del Club"
      onClose={onClose}
      footer={
        <Button type="button" onClick={onClose}>
          Listo
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-brand-muted">
            {images.length}/{MAX_IMAGES} fotos · JPG, PNG o WEBP, máximo 5 MB
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || images.length >= MAX_IMAGES}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-white hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            {uploading ? "Subiendo…" : "Agregar foto"}
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
        </div>

        {images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-10 flex flex-col items-center gap-2">
            <Camera className="w-6 h-6 text-white/15" />
            <p className="text-sm text-brand-muted/50">Todavía no hay fotos del club.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((url) => (
              <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemove(url)}
                  disabled={removingUrl === url}
                  title="Eliminar foto"
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center disabled:opacity-50 transition-colors"
                >
                  {removingUrl === url ? (
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  ) : (
                    <X className="w-3 h-3 text-white" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
      </div>
    </SettingsModuleModal>
  );
}
