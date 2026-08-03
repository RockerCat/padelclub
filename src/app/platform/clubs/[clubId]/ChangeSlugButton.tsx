"use client";

import { useState, useTransition, useRef } from "react";
import { Link2 } from "lucide-react";
import { Button, Input, Toast } from "@/components/ui";
import { SettingsModuleModal } from "@/app/(app)/[club]/admin/settings/SettingsModuleModal";
import { checkSlugAvailability } from "@/app/onboarding/actions";
import { updateClubSlug } from "./actions";

type SlugStatus = "idle" | "short" | "checking" | "available" | "unavailable";

const SLUG_STATUS_LABEL: Record<SlugStatus, { text: string; className: string } | null> = {
  idle: null,
  short: { text: "Usa al menos 3 caracteres", className: "text-xs text-brand-muted" },
  checking: { text: "Verificando disponibilidad...", className: "text-xs text-brand-muted" },
  available: { text: "Identificador disponible", className: "text-xs text-green-400" },
  unavailable: { text: "Identificador no disponible", className: "text-xs text-red-400" },
};

interface ChangeSlugButtonProps {
  clubId: string;
  currentSlug: string;
}

// SUPERADMIN-only. Reuses checkSlugAvailability (src/app/onboarding/actions.ts
// — the exact same live-availability check CreateClubFields already uses)
// and re-validates format/reserved/availability server-side inside
// updateClubSlug, never a second copy of those rules. Only clubs.slug ever
// changes here: owner, membership, configuration, is_active and club_id
// are all untouched, and the old slug is never redirected — it's simply
// available again the instant this succeeds.
export function ChangeSlugButton({ clubId, currentSlug }: ChangeSlugButtonProps) {
  const [open, setOpen] = useState(false);
  const [slugValue, setSlugValue] = useState(currentSlug);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleAvailabilityCheck(slug: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (slug.length === 0 || slug === currentSlug) {
      setSlugStatus("idle");
      return;
    }
    if (slug.length < 3) {
      setSlugStatus("short");
      return;
    }

    setSlugStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const { available } = await checkSlugAvailability(slug);
      setSlugStatus(available ? "available" : "unavailable");
    }, 500);
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
    setSlugValue(val);
    setError(null);
    scheduleAvailabilityCheck(val);
  }

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setSlugValue(currentSlug);
    setSlugStatus("idle");
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await updateClubSlug(clubId, slugValue);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setToastMessage("Identificador actualizado correctamente");
    });
  }

  const statusInfo = SLUG_STATUS_LABEL[slugStatus];
  const unchanged = slugValue === currentSlug;
  const canSubmit =
    !unchanged && slugValue.length >= 3 && slugStatus !== "unavailable" && slugStatus !== "checking";

  return (
    <>
      <Button
        variant="secondary"
        className="justify-between w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          Cambiar slug
        </span>
      </Button>

      {open && (
        <SettingsModuleModal
          title="Cambiar slug"
          onClose={handleClose}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={pending} onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="button" loading={pending} disabled={!canSubmit} onClick={handleConfirm}>
                Guardar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-brand-muted mb-2">
              Slug actual: <span className="text-white font-mono">/{currentSlug}</span>. Al
              cambiarlo queda disponible de inmediato para otro club — no se redirige desde el
              anterior.
            </p>
            <Input
              name="slug"
              label="Nuevo identificador"
              type="text"
              value={slugValue}
              onChange={handleSlugChange}
              hint={slugStatus === "idle" ? "Solo letras minúsculas, números y guiones." : undefined}
            />
            {statusInfo && <p className={statusInfo.className}>{statusInfo.text}</p>}
            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-2">
                {error}
              </p>
            )}
          </div>
        </SettingsModuleModal>
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
