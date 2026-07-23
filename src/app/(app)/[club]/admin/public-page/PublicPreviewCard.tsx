"use client";

import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, Eye } from "lucide-react";

interface PublicPreviewCardProps {
  clubSlug: string;
}

export function PublicPreviewCard({ clubSlug }: PublicPreviewCardProps) {
  const [copied, setCopied] = useState(false);
  // Starts as the relative path (matches the server-rendered HTML) and is
  // upgraded to an absolute URL once mounted — avoids a hydration mismatch
  // from branching on `typeof window` during render.
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    // Reads a browser-only API (unavailable during SSR) once on mount —
    // the documented, justified use of setState-in-effect for syncing with
    // an external system React has no other way to observe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const publicPath = `/${clubSlug}`;
  const publicUrl = origin ? `${origin}${publicPath}` : publicPath;

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Eye className="w-4 h-4 text-brand-muted" />
        <h3 className="text-sm font-semibold text-white">Vista previa pública</h3>
      </div>
      <p className="text-xs text-brand-muted/70 mb-4">
        Valida rápidamente cómo los jugadores ven tu club.
      </p>

      <div className="flex flex-col gap-4">
        <p className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono truncate">
          <span className="truncate">{publicUrl}</span>
        </p>

        <div className="flex flex-wrap gap-2">
          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium transition-all hover:brightness-110"
            style={{ backgroundColor: "var(--club-primary)", color: "var(--club-bg, #001A24)" }}
          >
            <ExternalLink className="w-4 h-4" />
            Abrir página pública
          </a>

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
        </div>
      </div>
    </div>
  );
}
