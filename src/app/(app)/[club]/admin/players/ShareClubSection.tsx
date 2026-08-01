"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Copy, Check, MessageCircle } from "lucide-react";

interface ShareClubSectionProps {
  clubName: string;
  clubSlug: string;
}

// The only PLAYER onboarding surface, public or private clubs alike — there
// are no player invitations (see CLAUDE.md → Club Sharing Principles): just
// this public URL. A public club joins instantly from it; a private club
// requests access from it — same link, same component, either way.
//
// Compact trigger + popover (same click-outside/Escape pattern already used
// by ContextMenu/FilterDropdown — no new UI primitive introduced), so this
// lives comfortably next to "Abrir página pública"/"Copiar enlace" in Club →
// Perfil público (PublicPreviewCard) instead of its own big card.
export function ShareClubSection({ clubName, clubSlug }: ShareClubSectionProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Starts as the relative path (matches SSR output) and upgrades to an
  // absolute URL once mounted — branching on `typeof window` directly in
  // the render body causes a hydration mismatch, since it's already true
  // by the time React hydrates on the client. Same pattern as
  // PublicPreviewCard.
  const [origin, setOrigin] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white hover:border-white/20 transition-colors"
      >
        <Share2 className="w-4 h-4" />
        Compartir club
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 bg-[#0e3347] border border-white/20 rounded-xl shadow-xl overflow-hidden min-w-[220px] z-[200] py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-400">Enlace copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 shrink-0" />
                Copiar enlace
              </>
            )}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            Compartir por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
