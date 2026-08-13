"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { GalleryLightbox } from "@/components/clubs/GalleryLightbox";

// Extraído tal cual (mismo JSX, mismo lightbox) del bloque "Galería" que
// antes vivía dentro de ClubInfoSections.tsx — sacado a su propio
// componente únicamente para poder reubicarlo entre Noticias y Torneos en
// page.tsx, sin duplicar la sección ni tocar Ubicación/Horarios/Contacto,
// que se quedan donde estaban dentro de ClubInfoSections.
export function ClubGallerySection({ images }: { images: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl bg-brand-surface border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-brand-muted" />
          <h3 className="text-sm font-semibold text-white">Galería</h3>
        </div>
        <div className="p-3 grid grid-cols-3 gap-2">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="block cursor-pointer rounded-lg overflow-hidden"
              aria-label={`Ver foto ${i + 1} en tamaño grande`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Foto ${i + 1}`} className="w-full aspect-square object-cover hover:opacity-90 transition-opacity" />
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null && (
        <GalleryLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          altPrefix="Foto"
        />
      )}
    </>
  );
}
