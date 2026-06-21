"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, LogoUpload } from "@/components/ui";
import { SettingsModuleModal } from "./SettingsModuleModal";
import { CoverUploadField } from "@/app/(app)/[club]/dashboard/onboarding/CoverUploadField";
import { useClubTheme } from "@/components/layout/ClubThemeProvider";
import { updateClubName, updateClubColors } from "./actions";
import type { Club } from "@/types/database";

interface ClubInfoModalProps {
  club: Club;
  onClose: () => void;
}

// LogoUpload / CoverUploadField self-save on file select — name and colors
// share the module's single "Guardar cambios" step.
export function ClubInfoModal({ club, onClose }: ClubInfoModalProps) {
  const router = useRouter();
  const { setColors } = useClubTheme();
  const [name, setName] = useState(club.name);
  const [primaryColor, setPrimaryColor] = useState(club.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(club.secondary_color);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handlePrimaryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPrimaryColor(e.target.value);
    setColors(e.target.value, secondaryColor);
  }

  function handleSecondaryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSecondaryColor(e.target.value);
    setColors(primaryColor, e.target.value);
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    const [nameResult, colorsResult] = await Promise.all([
      updateClubName(club.id, name),
      updateClubColors(club.id, primaryColor, secondaryColor),
    ]);
    setPending(false);
    const firstError = nameResult.error ?? colorsResult.error;
    if (firstError) {
      setError(firstError);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <SettingsModuleModal
      title="Información del club"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" loading={pending} onClick={handleSave}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row gap-5">
          <LogoUpload
            clubId={club.id}
            clubName={club.name}
            currentLogoUrl={club.logo_url}
            primaryColor={primaryColor}
          />
          <div className="flex-1">
            <CoverUploadField clubId={club.id} currentCoverUrl={club.cover_image_url} />
          </div>
        </div>

        <Input
          name="name"
          label="Nombre"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del club"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">Color principal</label>
            <p className="text-xs text-brand-muted">
              Sidebar, botones, badges y estados activos.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={handlePrimaryChange}
                className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0.5"
              />
              <span className="text-sm text-brand-muted font-mono">{primaryColor}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">Color secundario</label>
            <p className="text-xs text-brand-muted">
              Hover states, etiquetas informativas y elementos secundarios.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={secondaryColor}
                onChange={handleSecondaryChange}
                className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0.5"
              />
              <span className="text-sm text-brand-muted font-mono">{secondaryColor}</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
      </div>
    </SettingsModuleModal>
  );
}
