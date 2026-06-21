"use client";

import { Button } from "@/components/ui";
import { SettingsModuleModal } from "./SettingsModuleModal";
import { Step1Identity, type Step1Club } from "@/app/(app)/[club]/dashboard/onboarding/Step1Identity";

const FORM_ID = "settings-public-profile-form";

interface PublicProfileModalProps {
  club: Step1Club;
  onClose: () => void;
}

// Same component the onboarding wizard uses for this exact step — editing
// here should feel identical to setting it up the first time.
export function PublicProfileModal({ club, onClose }: PublicProfileModalProps) {
  return (
    <SettingsModuleModal
      title="Perfil público"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <Step1Identity club={club} formId={FORM_ID} onNext={onClose} hideStepHint />
    </SettingsModuleModal>
  );
}
