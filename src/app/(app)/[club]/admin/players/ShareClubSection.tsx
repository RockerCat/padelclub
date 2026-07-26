"use client";

import { useEffect, useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";

interface ShareClubSectionProps {
  clubName: string;
  clubSlug: string;
}

// The only PLAYER onboarding surface, public or private clubs alike — there
// are no player invitations (see CLAUDE.md → Club Sharing Principles): just
// this public URL. A public club joins instantly from it; a private club
// requests access from it — same link, same component, either way.
export function ShareClubSection({ clubName, clubSlug }: ShareClubSectionProps) {
  const [copied, setCopied] = useState(false);
  // Starts as the relative path (matches SSR output) and upgrades to an
  // absolute URL once mounted — branching on `typeof window` directly in
  // the render body causes a hydration mismatch, since it's already true
  // by the time React hydrates on the client. Same pattern as
  // PublicPreviewCard.
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const publicPath = `/${clubSlug}`;
  const publicUrl = origin ? `${origin}${publicPath}` : publicPath;

  const whatsappMessage =
    `🎾 ¡Únete a ${clubName}!\n\n` +
    `Reserva canchas, participa en torneos, rankings y actividades del club.\n\n` +
    `Regístrate aquí:\n${publicUrl}`;

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono truncate">
        <span className="truncate">{publicUrl}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white hover:border-white/20 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copiar enlace
            </>
          )}
        </button>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Compartir por WhatsApp
        </a>
      </div>
    </div>
  );
}
