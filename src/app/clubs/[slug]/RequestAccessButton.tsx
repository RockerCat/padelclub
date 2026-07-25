"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createJoinRequest } from "./actions";

interface Props {
  clubId: string;
  clubSlug: string;
  isPublic?: boolean;
  requestStatus: "none" | "pending" | "rejected";
  /**
   * Submits itself on mount instead of waiting for a click — set when the
   * visitor arrived via "Unirme al club" → signup/login → back here
   * (?intent=join-club). A ref guards against firing twice (React 18
   * double-invokes effects in dev, and this component doesn't unmount
   * between renders here).
   */
  autoSubmit?: boolean;
  className?: string;
}

export function RequestAccessButton({
  clubId,
  clubSlug,
  isPublic = false,
  requestStatus,
  autoSubmit = false,
  className = "",
}: Props) {
  const router = useRouter();
  const [sent, setSent] = useState(requestStatus === "pending");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoSubmitted = useRef(false);
  // Synchronous guard against a fast double-click/double-Enter firing a
  // second submission before React re-renders with the transition's
  // `pending` (which drives the button's own `disabled`) — the server
  // action is itself idempotent, but this keeps a duplicate request from
  // ever leaving the client in the first place.
  const submitting = useRef(false);

  function handleRequestJoin() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      const result = await createJoinRequest(clubId, clubSlug);
      submitting.current = false;
      if (result.error) {
        setError(result.error);
        return;
      }
      // Public club: join_public_club already created/confirmed the active
      // membership — go straight to the real dashboard for that role/club
      // instead of showing the "solicitud enviada" copy, which only applies
      // to the private request+approval flow below.
      if (result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      setSent(true);
    });
  }

  useEffect(() => {
    if (!autoSubmit || autoSubmitted.current) return;
    autoSubmitted.current = true;
    handleRequestJoin();
    // handleRequestJoin is stable enough for this one-shot, mount-only
    // trigger — re-running it on every render would defeat the ref guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit]);

  if (requestStatus === "rejected") {
    return (
      <div className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-center flex flex-col gap-1">
        <span className="text-white font-medium">Solicitud rechazada</span>
        <span className="text-brand-muted">
          Tu solicitud para unirte a este club no fue aceptada. Contacta al club directamente si crees que fue un error.
        </span>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm text-center flex flex-col gap-1">
        <span className="text-white font-medium">Solicitud pendiente</span>
        <span className="text-brand-muted">
          Tu solicitud fue enviada al club. Te avisaremos cuando sea revisada.
        </span>
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
        {pending ? "Enviando…" : isPublic ? "Unirme al club" : "Solicitar ingreso"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
