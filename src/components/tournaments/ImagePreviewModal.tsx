"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ImagePreviewModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

// No existe un Modal/Dialog genérico reutilizable en el proyecto — se
// replica el mismo patrón ya usado por ConfirmDialog (backdrop con blur,
// Escape, bloqueo de scroll, panel centrado/isolate) en vez de inventar
// un lenguaje visual nuevo. object-contain siempre, nunca deforma la
// imagen — la miniatura que abre este modal usa object-cover, este
// preview no.
export function ImagePreviewModal({ src, alt, onClose }: ImagePreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[401] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto isolate relative"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista ampliada"
            className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#082735] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 z-10"
          >
            <X className="w-4 h-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- portada arbitraria de Supabase Storage, no un asset de build */}
          <img
            src={src}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain rounded-2xl"
          />
        </div>
      </div>
    </>
  );
}
