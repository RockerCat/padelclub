"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { createPendingClub, type CreatePendingClubState } from "./actions";
import { checkSlugAvailability } from "@/app/onboarding/actions";
import { Button, Input } from "@/components/ui";

type SlugStatus = "idle" | "short" | "checking" | "available" | "unavailable";

const initialState: CreatePendingClubState = {};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SLUG_STATUS_LABEL: Record<SlugStatus, { text: string; className: string } | null> = {
  idle: null,
  short: { text: "Usa al menos 3 caracteres", className: "text-xs text-brand-muted" },
  checking: { text: "Verificando disponibilidad...", className: "text-xs text-brand-muted" },
  available: { text: "Identificador disponible", className: "text-xs text-green-400" },
  unavailable: { text: "Identificador no disponible", className: "text-xs text-red-400" },
};

// Same slug UX as onboarding's CreateClubFields (generate-from-name +
// debounced availability check via the same shared checkSlugAvailability),
// reused rather than reimplemented — only the target action and the
// absence of an owner-facing framing differ.
export function PendingClubFields() {
  const [state, action, pending] = useActionState(createPendingClub, initialState);
  const [slugValue, setSlugValue] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleAvailabilityCheck(slug: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (slug.length === 0) {
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

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugEdited) {
      const suggested = generateSlug(e.target.value);
      setSlugValue(suggested);
      scheduleAvailabilityCheck(suggested);
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
    setSlugValue(val);
    setSlugEdited(true);
    scheduleAvailabilityCheck(val);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const statusInfo = SLUG_STATUS_LABEL[slugStatus];
  const showServerSlugError = !!state.fieldErrors?.slug;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Input
        name="name"
        label="Nombre del club"
        type="text"
        placeholder="Club Padel Madrid"
        required
        onChange={handleNameChange}
        error={state.fieldErrors?.name}
      />

      <div className="flex flex-col gap-1.5">
        <Input
          name="slug"
          label="Identificador único"
          type="text"
          placeholder="club-padel-madrid"
          required
          value={slugValue}
          onChange={handleSlugChange}
          error={state.fieldErrors?.slug}
          hint={slugStatus === "idle" ? "Solo letras minúsculas, números y guiones." : undefined}
        />
        {statusInfo && !showServerSlugError && (
          <p className={statusInfo.className}>{statusInfo.text}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white/80">Visibilidad</span>
        <div className="flex flex-col gap-2">
          {[
            { value: "private", label: "Privado", desc: "Recomendado mientras se prepara el club." },
            { value: "public", label: "Público", desc: "Cualquier jugador podrá encontrarlo y unirse." },
          ].map((opt) => (
            <label
              key={opt.value}
              className="relative flex items-start gap-3 p-3 rounded-xl border border-white/10 cursor-pointer hover:border-white/20 has-[:checked]:border-brand-primary/50 has-[:checked]:bg-brand-primary/10 transition-colors"
            >
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                defaultChecked={opt.value === "private"}
                className="mt-0.5 w-4 h-4 accent-brand-primary shrink-0"
              />
              <div>
                <span className="text-sm font-medium text-white block">{opt.label}</span>
                <span className="text-xs text-brand-muted leading-snug">{opt.desc}</span>
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-brand-muted/70">
          El club queda inactivo (no visible ni buscable) hasta que su propietario definitivo lo reclame.
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <Button type="submit" loading={pending} size="lg" className="w-full mt-2">
        Crear club
      </Button>
    </form>
  );
}
