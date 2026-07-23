"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { updateClubIdentity, updateClubSocial } from "./actions";

export type Step1Club = {
  id: string;
  description: string | null;
  visibility: string;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
};

interface Step1Props {
  club: Step1Club;
  onNext: () => void;
  formId: string;
  /** Hides the "Necesaria para completar este paso" hint — irrelevant outside the onboarding wizard (e.g. Settings). */
  hideStepHint?: boolean;
}

export function Step1Identity({ club, onNext, formId, hideStepHint = false }: Step1Props) {
  const router = useRouter();
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const [identityResult, socialResult] = await Promise.all([
      updateClubIdentity(club.id, {}, formData),
      updateClubSocial(club.id, {}, formData),
    ]);

    if (identityResult.error || socialResult.error) {
      setError(identityResult.error ?? socialResult.error ?? null);
      return;
    }

    router.refresh();
    onNextRef.current();
  }

  return (
    <form id={formId} action={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
        {/* Left column: description + visibility */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">Descripción</label>
            <textarea
              name="description"
              defaultValue={club.description ?? ""}
              placeholder="Breve descripción de tu club para que los jugadores lo conozcan…"
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
            />
            {!hideStepHint && (
              <p className="text-xs text-brand-muted/60">
                Necesaria para completar este paso.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-white/80">Visibilidad</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  defaultChecked={club.visibility !== "private"}
                  className="mt-0.5 accent-brand-primary w-4 h-4 shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Público</span>
                  <p className="text-xs text-brand-muted/60 mt-0.5">
                    Cualquier jugador puede encontrar el club y unirse
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  defaultChecked={club.visibility === "private"}
                  className="mt-0.5 accent-brand-primary w-4 h-4 shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Privado</span>
                  <p className="text-xs text-brand-muted/60 mt-0.5">
                    Solo con invitación o aprobación del administrador
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right column: social / contact — optional */}
        <div className="flex flex-col gap-4">
          <Input
            name="whatsapp"
            label="WhatsApp"
            type="text"
            defaultValue={club.whatsapp ?? ""}
            placeholder="+57 300 000 0000"
            hint="Número de contacto del club"
          />
          <Input
            name="instagram"
            label="Instagram"
            type="text"
            defaultValue={club.instagram ?? ""}
            placeholder="@tuclub"
          />
          <Input
            name="facebook"
            label="Facebook"
            type="url"
            defaultValue={club.facebook ?? ""}
            placeholder="https://facebook.com/tuclub"
          />
          <Input
            name="youtube"
            label="YouTube"
            type="url"
            defaultValue={club.youtube ?? ""}
            placeholder="https://youtube.com/@tuclub"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}
    </form>
  );
}
