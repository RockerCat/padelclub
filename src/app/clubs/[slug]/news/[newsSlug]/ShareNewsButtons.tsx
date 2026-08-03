"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

interface ShareNewsButtonsProps {
  title: string;
  path: string;
}

// Same hydration-safe origin pattern as PublicPreviewCard — starts as the
// relative path (matches SSR output) and upgrades to an absolute URL once
// mounted, so WhatsApp/clipboard always get a real shareable link.
export function ShareNewsButtons({ title, path }: ShareNewsButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}${path}` : path;
  const whatsappMessage = `🏆 ${title}\n\nConoce todos los resultados aquí 👇\n\n${url}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        Compartir por WhatsApp
      </a>

      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white hover:border-white/20 transition-colors"
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
