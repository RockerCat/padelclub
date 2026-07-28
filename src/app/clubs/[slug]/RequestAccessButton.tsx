"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createJoinRequest } from "./actions";
import { updateOwnPhone } from "@/app/(app)/profile/actions";

// Modal mínimo — solo se abre cuando createJoinRequest/join_public_club
// rechaza la operación por falta de un WhatsApp válido (ERRCODE P0006,
// ver migración 20260830000001). Reutiliza la misma mutación
// (updateOwnPhone) que la edición de WhatsApp en Mi Perfil — nunca una
// segunda fuente de verdad para profiles.phone. Nunca se muestra si el
// usuario ya tiene un teléfono válido, porque en ese caso la RPC nunca
// devuelve P0006 en primer lugar.
function WhatsAppRequiredModal({
  open,
  onCancel,
  onSaved,
}: {
  open: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateOwnPhone(value);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center px-4">
      <div
        className="fixed inset-0 bg-black/60"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm bg-[#082735] border border-white/10 rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Completa tu WhatsApp</h2>
          <p className="text-sm text-brand-muted mt-1">
            Agrega tu número de WhatsApp para unirte al club. El club lo utilizará para contactarte.
          </p>
        </div>
        <Input
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+57 317 367 2033"
          hint="Incluye el código de país."
          autoFocus
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" size="sm" loading={saving} onClick={handleSave}>
            Guardar y continuar
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
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

      // Backend rejected for missing/invalid WhatsApp (P0006) — never a
      // technical error banner: open the small "completa tu WhatsApp"
      // modal instead. Saving there retries this exact same action, so a
      // user who already has a valid phone never sees this at all.
      if (result.missingPhone) {
        setPhoneModalOpen(true);
        return;
      }
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

      <WhatsAppRequiredModal
        open={phoneModalOpen}
        onCancel={() => setPhoneModalOpen(false)}
        onSaved={() => {
          setPhoneModalOpen(false);
          // El número ya quedó guardado — reintenta la misma acción
          // original automáticamente, sin que el usuario tenga que volver
          // a pulsar "Unirme al club"/"Solicitar acceso".
          handleRequestJoin();
        }}
      />
    </div>
  );
}
