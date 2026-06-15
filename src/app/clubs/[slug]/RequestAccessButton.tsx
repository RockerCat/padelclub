"use client";

import { useState } from "react";

export function RequestAccessButton({ whatsapp }: { whatsapp: string | null }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-brand-muted text-center max-w-sm">
          Próximamente podrás solicitar acceso directamente desde PadelClub.
          {whatsapp && (
            <>
              {" "}Por ahora puedes contactar al club por{" "}
              <a
                href={`https://wa.me/${whatsapp.replace(/[^\d+]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-brand-primary transition-colors"
              >
                WhatsApp →
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setRevealed(true)}
      className="inline-flex items-center justify-center rounded-xl border border-white/20 px-7 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
    >
      Solicitar acceso
    </button>
  );
}
