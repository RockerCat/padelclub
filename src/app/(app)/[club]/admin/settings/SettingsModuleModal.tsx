"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface SettingsModuleModalProps {
  title: string;
  onClose: () => void;
  // "xl" (1040px, creciendo hasta 1320px en pantallas muy anchas) es
  // exclusivo del modal de Noticias (layout de dos columnas, imagen con
  // ancho máximo fijo, formulario ocupando el resto) — puramente
  // aditivo, "md"/"lg" conservan el mismo ancho de siempre para el
  // resto de los 7 módulos que ya usan este shell.
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  // Opcional — expone el nodo del panel a un llamador que necesite
  // implementar su propio focus trap sobre él (ver ChangeClubModal).
  // Puramente aditivo: ningún otro llamador de este shell lo pasa, así
  // que su comportamiento no cambia.
  panelRef?: React.Ref<HTMLDivElement>;
}

// Same modal shell as MemberModal/CreateCourtModal/ConfirmDialog — blurred
// backdrop, centered panel on desktop / bottom sheet on mobile. Shared by
// all 7 settings modules so each one only has to provide its fields.
export function SettingsModuleModal({ title, onClose, size = "md", children, footer, panelRef }: SettingsModuleModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
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
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          ref={panelRef}
          className={`pointer-events-auto w-full ${
            size === "xl"
              ? "md:w-[640px] lg:w-[1040px] xl:w-[1200px] 2xl:w-[1320px]"
              : size === "lg"
              ? "md:w-[640px]"
              : "md:w-[480px]"
          } bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col`}
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/10 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
