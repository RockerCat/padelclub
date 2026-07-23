"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createJoinRequest } from "./actions";

interface Props {
  clubId: string;
  clubSlug: string;
  whatsapp: string | null;
  isPublic?: boolean;
  alreadyRequested?: boolean;
  className?: string;
}

export function RequestAccessButton({
  clubId,
  clubSlug,
  whatsapp,
  isPublic = false,
  alreadyRequested = false,
  className = "",
}: Props) {
  const router = useRouter();
  const [publicComingSoonRevealed, setPublicComingSoonRevealed] = useState(false);
  const [sent, setSent] = useState(alreadyRequested);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRequestJoin() {
    setError(null);
    startTransition(async () => {
      const result = await createJoinRequest(clubId, clubSlug);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
      router.refresh();
    });
  }

  // Joining a public club instantly isn't built yet — keep the existing
  // "coming soon" placeholder for that path. Only private clubs get the
  // real join-request flow below.
  if (isPublic) {
    if (publicComingSoonRevealed) {
      return (
        <div className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-brand-muted text-center flex flex-col gap-1">
          <span className="text-white font-medium">¡Casi listo!</span>
          <span>Próximamente podrás unirte directamente desde MiPadelClub.</span>
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
        onClick={() => setPublicComingSoonRevealed(true)}
        className={`inline-flex items-center justify-center rounded-xl px-7 py-3 text-sm font-semibold transition-colors bg-brand-primary text-brand-bg hover:bg-brand-primary/90 ${className}`}
      >
        Unirme al club
      </button>
    );
  }

  if (sent) {
    return (
      <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm text-center flex flex-col gap-1">
        <span className="text-white font-medium">Solicitud enviada</span>
        <span className="text-brand-muted">Un administrador revisará tu solicitud de ingreso.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleRequestJoin}
        disabled={pending}
        className={`inline-flex items-center justify-center rounded-xl border border-white/20 text-white text-sm font-semibold px-7 py-3 hover:bg-white/5 transition-colors disabled:opacity-60 ${className}`}
      >
        {pending ? "Enviando…" : "Solicitar ingreso"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
