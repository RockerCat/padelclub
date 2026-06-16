"use client";

import { useState } from "react";

interface Props {
  whatsapp: string | null;
  isPublic?: boolean;
  className?: string;
}

export function RequestAccessButton({ whatsapp, isPublic = false, className = "" }: Props) {
  const [revealed, setRevealed] = useState(false);

  const buttonLabel   = isPublic ? "Unirme al club"    : "Solicitar acceso";
  const revealedTitle = isPublic ? "¡Casi listo!"      : "Solicitud registrada";
  const revealedBody  = isPublic
    ? "Próximamente podrás unirte directamente desde PadelClub."
    : "Próximamente podrás solicitar acceso directamente desde PadelClub.";

  if (revealed) {
    return (
      <div className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-brand-muted text-center flex flex-col gap-1">
        <span className="text-white font-medium">{revealedTitle}</span>
        <span>{revealedBody}</span>
        {whatsapp && (
          <span>
            Por ahora contacta al club por{" "}
            <a
              href={`https://wa.me/${whatsapp.replace(/[^\d+]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-brand-primary transition-colors underline"
            >
              WhatsApp
            </a>
            .
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setRevealed(true)}
      className={`inline-flex items-center justify-center rounded-xl px-7 py-3 text-sm font-semibold transition-colors ${
        isPublic
          ? "bg-brand-primary text-brand-bg hover:bg-brand-primary/90"
          : "border border-white/20 text-white hover:bg-white/5"
      } ${className}`}
    >
      {buttonLabel}
    </button>
  );
}
