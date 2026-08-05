"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

interface ReservationShareActionsProps {
  url: string;
  message: string;
  className?: string;
  /** Botones angostos de texto (sin el fondo/borde de pill) — para
   *  contextos apretados como una tarjeta de "Mis reservas". El tamaño
   *  normal (default) es el de ReservationTicketPanel/ReservationShareView. */
  compact?: boolean;
}

// Único lugar donde vive "WhatsApp" + "Copiar enlace" para
// una reserva — reutilizado tal cual por ReservationTicketPanel (OWNER/
// ADMIN), PlayerActivity (tarjetas "Mis reservas"/"Compartir") y
// ReservationShareView (el detalle en sí), en vez de tres implementaciones
// separadas de "abrir wa.me" + "copiar al portapapeles". Mismo lenguaje
// visual que ShareNewsButtons.tsx (noticias) — mismos iconos, mismos
// colores — para que "compartir" se sienta consistente en toda la app.
export function ReservationShareActions({ url, message, className, compact }: ReservationShareActionsProps) {
  const [copied, setCopied] = useState(false);
  // message llega como string Unicode normal (emojis/tildes/ñ/saltos de
  // línea/negrita de WhatsApp sin escapar) — se codifica UNA sola vez acá,
  // nunca antes. api.whatsapp.com/send (a diferencia de wa.me/?text=, cuyo
  // redirect puede mostrar "�" en algunos clientes) decodifica UTF-8 de
  // forma consistente en todas las plataformas.
  const whatsappHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (compact) {
    // Botón (nunca <a>) para el WhatsApp compacto — este variant se usa
    // dentro de la tarjeta de "Mis reservas", que es en sí misma un
    // <Link>; un <a> anidado dentro de otro <a> es HTML inválido y el
    // navegador puede resolver el click de forma impredecible.
    // stopPropagation en ambos botones evita que el click también dispare
    // la navegación de la tarjeta.
    return (
      <div className={`flex items-center gap-3 ${className ?? ""}`}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(whatsappHref, "_blank", "noopener,noreferrer");
          }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <MessageCircle className="w-3 h-3" />
          WhatsApp
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCopy();
          }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-muted hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Enlace copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copiar enlace
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        WhatsApp
      </a>

      <button
        type="button"
        onClick={handleCopy}
        className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-medium border border-white/15 text-white/90 hover:border-white/30 hover:bg-white/5 transition-colors"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400">Enlace copiado</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copiar enlace
          </>
        )}
      </button>
    </div>
  );
}
