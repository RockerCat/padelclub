"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { Input } from "@/components/ui";
import { createCourt, type CourtFormState } from "@/app/(app)/[club]/admin/courts/actions";
import { SURFACE_OPTIONS } from "@/components/courts/CourtIllustration";
import { CourtPreviewCard } from "@/components/courts/CourtPreviewCard";

interface Step5Props {
  clubId: string;
  clubSlug: string;
  formId: string;
  alreadyHasCourt: boolean;
  onNext: () => void;
}

export function Step5Court({ clubId, clubSlug, formId, alreadyHasCourt, onNext }: Step5Props) {
  const router = useRouter();
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const boundAction = createCourt.bind(null, clubId);
  const [state, formAction] = useActionState<CourtFormState, FormData>(boundAction, {});

  const [name, setName] = useState("");
  const [surface, setSurface] = useState("");

  useEffect(() => {
    if (state.success) {
      router.refresh();
      onNextRef.current();
    }
  }, [state.success, router]);

  if (alreadyHasCourt) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500/15 shrink-0">
          <Check className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Canchas configuradas</p>
          <p className="text-xs text-brand-muted/60 mt-0.5">
            Ya tienes canchas activas.{" "}
            <Link
              href={`/${clubSlug}/admin/courts`}
              className="underline hover:text-brand-muted transition-colors"
            >
              Administrar canchas
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
      {/* Left column: form */}
      <div className="flex flex-col gap-5">
        <p className="text-xs text-brand-muted/70">
          Tu club ya está listo para operar. Ahora crea tu primera cancha para comenzar a recibir reservas.
        </p>

        <form id={formId} action={formAction} className="flex flex-col gap-5">
          <Input
            name="name"
            label="Nombre de la cancha"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cancha 1"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">Superficie</label>
            <select
              name="surface"
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
            >
              {SURFACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#001A24]">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <input type="hidden" name="sort_order" value="0" />

          {state.error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {state.error}
            </p>
          )}

          <p className="text-xs text-brand-muted/60">
            Puedes configurar más detalles y agregar canchas adicionales desde{" "}
            <Link
              href={`/${clubSlug}/admin/courts`}
              className="underline hover:text-brand-muted transition-colors"
            >
              Administrar canchas
            </Link>.
          </p>
        </form>
      </div>

      {/* Right column: live preview */}
      <CourtPreviewCard name={name} surface={surface} placeholderName="Tu primera cancha" />
    </div>
  );
}
